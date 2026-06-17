// Stripe webhook: on checkout.session.completed, records the paid booking,
// blocks the dates, and sends a branded confirmation email (via Resend,
// when RESEND_API_KEY is configured).
// Deploy with verify_jwt = false: authentication is the Stripe signature.
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "");
const cryptoProvider = Stripe.createSubtleCryptoProvider();

function confirmationEmailHtml(booking: Record<string, string>) {
  return `
  <div style="margin:0;padding:24px;background:#f7f6f0;font-family:Arial,Helvetica,sans-serif;color:#18211d;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e4e2d8;">
      <div style="background:#0c1a14;padding:20px 28px;display:flex;align-items:center;gap:10px;">
        <img src="https://ebrostay.com/assets/ebrostay-icon-192.png" alt="" width="34" height="34" style="display:block;border-radius:8px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:-0.5px;">Ebrostay</span>
      </div>
      <div style="padding:28px;">
        <h1 style="margin:0 0 6px;font-size:22px;">Reserva confirmada</h1>
        <p style="margin:0 0 18px;color:#66716a;">Hemos recibido tu pago. Estos son los datos de tu estancia:</p>
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          <tr><td style="padding:8px 0;color:#66716a;">Vivienda</td><td style="padding:8px 0;text-align:right;font-weight:bold;">${booking.property_name}</td></tr>
          <tr><td style="padding:8px 0;color:#66716a;border-top:1px solid #eee;">Entrada</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee;">${booking.start_date}</td></tr>
          <tr><td style="padding:8px 0;color:#66716a;border-top:1px solid #eee;">Salida</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee;">${booking.end_date}</td></tr>
          <tr><td style="padding:8px 0;color:#66716a;border-top:1px solid #eee;">Pagado ahora</td><td style="padding:8px 0;text-align:right;border-top:1px solid #eee;font-weight:bold;">${booking.amount} EUR</td></tr>
        </table>
        ${booking.invoice_url ? `<p style="margin:22px 0 0;"><a href="${booking.invoice_url}" style="display:inline-block;background:#c8793a;color:#fff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:6px;">Ver factura</a></p>` : ""}
        <p style="margin:22px 0 0;color:#66716a;font-size:14px;">También puedes consultar tus reservas y facturas en <a href="https://ebrostay.com/account.html" style="color:#2f6b55;">ebrostay.com</a> en la sección "Mi cuenta".</p>
      </div>
      <div style="padding:16px 28px;border-top:1px solid #eee;color:#66716a;font-size:13px;">
        Ebrostay &middot; Zaragoza &middot; <a href="mailto:info@ebrostay.com" style="color:#2f6b55;">info@ebrostay.com</a>
      </div>
    </div>
  </div>`;
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !webhookSecret) return new Response("not configured", { status: 503 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
  } catch {
    return new Response("bad signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }
  const md = session.metadata || {};

  let invoiceUrl: string | null = null;
  let invoicePdf: string | null = null;
  let receiptUrl: string | null = null;
  try {
    if (session.invoice) {
      const invoice = await stripe.invoices.retrieve(String(session.invoice));
      invoiceUrl = invoice.hosted_invoice_url ?? null;
      invoicePdf = invoice.invoice_pdf ?? null;
    }
    if (session.payment_intent) {
      const intent = await stripe.paymentIntents.retrieve(String(session.payment_intent), { expand: ["latest_charge"] });
      receiptUrl = (intent.latest_charge as Stripe.Charge | null)?.receipt_url ?? null;
    }
  } catch (error) {
    console.error("invoice/receipt lookup failed", error);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const customerEmail = md.user_email || session.customer_details?.email || null;

  // idempotent on stripe_session_id: retries do not duplicate
  const { data: inserted, error } = await db
    .from("bookings")
    .upsert({
      stripe_session_id: session.id,
      user_id: md.user_id || null,
      customer_email: customerEmail,
      customer_name: session.customer_details?.name || null,
      property_id: md.property_id || null,
      property_name: md.property_name || "",
      start_date: md.start_date,
      end_date: md.end_date,
      months: Number(md.months) || null,
      amount_eur: (session.amount_total ?? 0) / 100,
      currency: session.currency || "eur",
      stripe_payment_intent: session.payment_intent ? String(session.payment_intent) : null,
      invoice_url: invoiceUrl,
      invoice_pdf: invoicePdf,
      receipt_url: receiptUrl,
      status: "paid"
    }, { onConflict: "stripe_session_id", ignoreDuplicates: true })
    .select()
    .maybeSingle();
  if (error) {
    console.error("booking insert failed", error);
    return new Response("db error", { status: 500 });
  }

  if (inserted) {
    // Drop this checkout's temporary hold, then confirm the block. The
    // exclusion constraint guarantees no overlap with another confirmed
    // booking; if it fires, another guest paid for these dates first — refund
    // and flag this booking rather than double-book.
    await db.from("availability_blocks").delete().eq("note", `hold:${session.id}`);
    const { error: blockError } = await db.from("availability_blocks").insert({
      property_id: md.property_id,
      start_date: md.start_date,
      end_date: md.end_date,
      note: `stripe:${session.id}`
    });
    if (blockError) {
      console.error("availability conflict; refunding", blockError);
      await db.from("bookings").update({ status: "conflict" }).eq("stripe_session_id", session.id);
      try {
        if (session.payment_intent) {
          await stripe.refunds.create({ payment_intent: String(session.payment_intent) });
        }
      } catch (refundError) {
        console.error("refund failed", refundError);
      }
      return new Response(JSON.stringify({ received: true, conflict: true }), { status: 200 });
    }

    // Route the rent to the owner's connected account (Stripe Connect), if the
    // property's owner has finished onboarding. Deposit and the platform fee
    // stay on the platform. Failures never block booking recording.
    try {
      if (md.property_id) {
        const { data: property } = await db.from("properties")
          .select("owner_id").eq("id", md.property_id).maybeSingle();
        if (property?.owner_id) {
          const { data: payout } = await db.from("owner_payout_details")
            .select("stripe_account_id, connect_status").eq("owner_id", property.owner_id).maybeSingle();
          if (payout?.stripe_account_id && payout.connect_status === "active") {
            // The guest pays rent + commission + deposit. Ebrostay keeps the
            // commission (its fee) and holds the deposit; the owner receives
            // the full rent = total - deposit - commission.
            const depositEur = Number(md.deposit_eur) || 0;
            const commissionEur = Number(md.commission_eur) || 0;
            const totalEur = (session.amount_total ?? 0) / 100;
            const ownerEur = Math.max(0, Math.round((totalEur - depositEur - commissionEur) * 100) / 100);
            if (ownerEur > 0) {
              await stripe.transfers.create({
                amount: Math.round(ownerEur * 100),
                currency: session.currency || "eur",
                destination: payout.stripe_account_id,
                transfer_group: session.id,
                metadata: { booking_session: session.id, property_id: md.property_id }
              });
            }
          }
        }
      }
    } catch (transferError) {
      console.error("owner transfer failed", transferError);
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey && customerEmail) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: Deno.env.get("EMAIL_FROM") || "Ebrostay <reservas@ebrostay.com>",
            to: [customerEmail],
            subject: `Reserva confirmada: ${md.property_name}`,
            html: confirmationEmailHtml({
              property_name: md.property_name || "",
              start_date: md.start_date || "",
              end_date: md.end_date || "",
              amount: String((session.amount_total ?? 0) / 100),
              invoice_url: invoiceUrl || ""
            })
          })
        });
      } catch (mailError) {
        console.error("confirmation email failed", mailError);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
