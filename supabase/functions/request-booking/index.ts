// Records a booking *request* (no online payment) and emails Ebrostay.
// Auth: Supabase JWT (verify_jwt). Price, commission and availability are
// computed server-side; the client only sends property, dates and tenant
// names. Fees mirror the previous checkout: rent (1-11 whole months) +
// Ebrostay commission (15% of rent, VAT 21% included, capped at one month's
// rent) + refundable deposit. We review the request and, once accepted,
// mark the property taken from the admin property editor.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MONTHS = 11;
const COMMISSION_PCT = 0.15;

function addMonths(startDate: string, months: number) {
  const end = new Date(`${startDate}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + months);
  return end.toISOString().slice(0, 10);
}

function addMonthsMinusDay(startDate: string, months: number) {
  const end = new Date(`${addMonths(startDate, months)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

// Billed months for a stay: whole months from the start date, rounded up,
// minimum one. The end date is the (exclusive) check-out date, so a stay from
// the start to exactly start + n months is billed as n months.
function billedMonths(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (months < 1) months = 1;
  while (addMonths(startDate, months) < endDate) months += 1;
  return months;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function row(label: string, value: string, strong = false) {
  return `<tr><td style="padding:8px 0;color:#66716a;border-top:1px solid #eee;">${label}</td>` +
    `<td style="padding:8px 0;text-align:right;border-top:1px solid #eee;${strong ? "font-weight:bold;" : ""}">${value}</td></tr>`;
}

// Email to Ebrostay with the full request and fee breakdown.
function teamEmailHtml(r: Record<string, string>) {
  return `
  <div style="margin:0;padding:24px;background:#f7f6f0;font-family:Arial,Helvetica,sans-serif;color:#18211d;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e4e2d8;">
      <div style="background:#0c1a14;padding:20px 28px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:-0.5px;">Ebrostay · Nueva solicitud de reserva</span>
      </div>
      <div style="padding:28px;">
        <p style="margin:0 0 18px;color:#66716a;">Un cliente quiere reservar. Revisa los datos y, si aceptas, marca la vivienda como ocupada en el editor de la propiedad.</p>
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          <tr><td style="padding:8px 0;color:#66716a;">Vivienda</td><td style="padding:8px 0;text-align:right;font-weight:bold;">${r.property_name}</td></tr>
          ${row("Entrada", r.start_date)}
          ${row("Salida", r.end_date)}
          ${row("Duración", r.months_label)}
          ${row("Alquiler", `${r.rent} EUR`)}
          ${row("Comisión (15%, IVA incl.)", `${r.commission} EUR`)}
          ${Number(r.deposit) > 0 ? row("Fianza reembolsable", `${r.deposit} EUR`) : ""}
          ${row("Total estimado", `${r.total} EUR`, true)}
          ${row("Cliente", r.customer_email)}
          ${row("Inquilinos", r.tenant_names || "—")}
        </table>
        <p style="margin:22px 0 0;color:#66716a;font-size:14px;">Solicitud registrada en el panel de administración (Reservas → Solicitudes).</p>
      </div>
    </div>
  </div>`;
}

// Acknowledgement to the customer: we'll get back to you shortly.
function customerEmailHtml(r: Record<string, string>) {
  return `
  <div style="margin:0;padding:24px;background:#f7f6f0;font-family:Arial,Helvetica,sans-serif;color:#18211d;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e4e2d8;">
      <div style="background:#0c1a14;padding:20px 28px;display:flex;align-items:center;gap:10px;">
        <img src="https://ebrostay.com/assets/ebrostay-icon-192.png" alt="" width="34" height="34" style="display:block;border-radius:8px;">
        <span style="color:#fff;font-size:20px;font-weight:bold;letter-spacing:-0.5px;">Ebrostay</span>
      </div>
      <div style="padding:28px;">
        <h1 style="margin:0 0 6px;font-size:22px;">Hemos recibido tu solicitud</h1>
        <p style="margin:0 0 18px;color:#66716a;">Gracias por tu interés. Revisaremos la disponibilidad y te responderemos en breve para confirmar la reserva y el siguiente paso.</p>
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          <tr><td style="padding:8px 0;color:#66716a;">Vivienda</td><td style="padding:8px 0;text-align:right;font-weight:bold;">${r.property_name}</td></tr>
          ${row("Entrada", r.start_date)}
          ${row("Salida", r.end_date)}
          ${row("Duración", r.months_label)}
          ${row("Alquiler", `${r.rent} EUR`)}
          ${row("Comisión (15%, IVA incl.)", `${r.commission} EUR`)}
          ${Number(r.deposit) > 0 ? row("Fianza reembolsable", `${r.deposit} EUR`) : ""}
          ${row("Total estimado", `${r.total} EUR`, true)}
        </table>
        <p style="margin:22px 0 0;color:#66716a;font-size:14px;">No se ha realizado ningún cargo. Este total es solo una estimación; lo confirmamos contigo antes de cualquier pago.</p>
      </div>
      <div style="padding:16px 28px;border-top:1px solid #eee;color:#66716a;font-size:13px;">
        Ebrostay &middot; Zaragoza &middot; <a href="mailto:info@ebrostay.com" style="color:#2f6b55;">info@ebrostay.com</a>
      </div>
    </div>
  </div>`;
}

// Sends one email via Resend and reports the outcome. Resend returning a
// non-2xx (e.g. a bad API key or unverified domain) does NOT throw, so we
// must inspect the response — otherwise a misconfigured key fails silently.
async function sendEmail(label: string, payload: Record<string, unknown>) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error(`email skipped (${label}): RESEND_API_KEY not set`);
    return { ok: false, error: "no_api_key" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`email failed (${label}): ${res.status} ${text.slice(0, 300)}`);
      return { ok: false, error: `http_${res.status}` };
    }
    let id: string | undefined;
    try { id = JSON.parse(text)?.id; } catch { /* non-JSON success body */ }
    console.log(`email sent (${label}): ${id || "ok"}`);
    return { ok: true, id };
  } catch (mailError) {
    console.error(`email error (${label})`, mailError);
    return { ok: false, error: "network" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: profile } = await admin.from("profiles").select("deactivated_at").eq("id", user.id).maybeSingle();
    if (profile?.deactivated_at) return json({ error: "unauthorized" }, 401);

    const { propertyId, startDate, endDate, months, tenantNames } = await req.json();
    if (!propertyId || !DATE_RE.test(String(startDate || ""))) {
      return json({ error: "bad_request" }, 400);
    }

    const { data: property } = await admin
      .from("properties")
      .select("id, name, address, price_number, is_published, available_from, deposit_amount, min_stay_months, max_stay_months")
      .eq("id", propertyId)
      .maybeSingle();
    if (!property || !property.is_published) return json({ error: "not_found" }, 404);

    // Clients send a check-out date; older cached clients send a month count.
    let bookingEnd: string;
    if (DATE_RE.test(String(endDate || ""))) {
      bookingEnd = endDate;
    } else {
      const monthCount = Math.max(1, Math.min(MAX_MONTHS, Number(months) || 0));
      bookingEnd = addMonthsMinusDay(startDate, monthCount);
    }
    if (bookingEnd <= startDate) return json({ error: "bad_request" }, 400);

    const stayMonths = billedMonths(startDate, bookingEnd);
    const maxMonths = Math.min(MAX_MONTHS, property.max_stay_months || MAX_MONTHS);
    if (stayMonths > maxMonths) return json({ error: "max_stay" }, 400);
    const minMonths = Math.max(1, property.min_stay_months || 1);
    if (stayMonths < minMonths) return json({ error: "min_stay" }, 400);

    const today = new Date().toISOString().slice(0, 10);
    if (startDate < today) return json({ error: "dates_unavailable" }, 409);
    if (property.available_from && startDate < property.available_from) {
      return json({ error: "dates_unavailable" }, 409);
    }

    // Reject if the range overlaps a confirmed block (a manually taken stay).
    const { data: overlap } = await admin
      .from("availability_blocks")
      .select("id")
      .eq("property_id", property.id)
      .lte("start_date", bookingEnd)
      .gte("end_date", startDate)
      .limit(1);
    if (overlap && overlap.length > 0) return json({ error: "dates_unavailable" }, 409);

    const price = Number(property.price_number) || 0;
    const rentTotal = stayMonths * price;
    // Commission: 15% of rent, VAT 21% included, capped at one month's rent.
    const commission = Math.min(COMMISSION_PCT * rentTotal, price);
    const depositEur = Number(property.deposit_amount) || 0;
    const total = rentTotal + commission + depositEur;

    const names = String(tenantNames || "").trim().slice(0, 800);
    const monthsLabel = `${stayMonths} ${stayMonths === 1 ? "mes" : "meses"}`;
    const customerEmail = user.email || null;

    // Record the request first — this is the reliable record the admin panel
    // reads, so it must succeed even if email delivery later fails.
    const { error: insertError } = await admin.from("booking_requests").insert({
      user_id: user.id,
      customer_email: customerEmail,
      property_id: property.id,
      property_name: property.name,
      start_date: startDate,
      end_date: bookingEnd,
      months: stayMonths,
      rent_eur: rentTotal.toFixed(2),
      commission_eur: commission.toFixed(2),
      deposit_eur: depositEur.toFixed(2),
      total_eur: total.toFixed(2),
      tenant_names: names || null
    });
    if (insertError) {
      console.error("booking request insert failed", insertError);
      return json({ error: "server_error" }, 500);
    }

    const fields = {
      property_name: escapeHtml(property.name),
      start_date: startDate,
      end_date: bookingEnd,
      months_label: monthsLabel,
      rent: rentTotal.toFixed(2),
      commission: commission.toFixed(2),
      deposit: depositEur.toFixed(2),
      total: total.toFixed(2),
      customer_email: escapeHtml(customerEmail || "—"),
      tenant_names: escapeHtml(names)
    };

    const from = Deno.env.get("EMAIL_FROM") || "Ebrostay <reservas@ebrostay.com>";
    const teamTo = Deno.env.get("EMAIL_TO") || "info@ebrostay.com";

    const teamResult = await sendEmail("team", {
      from,
      to: [teamTo],
      reply_to: customerEmail || undefined,
      subject: `Nueva solicitud de reserva: ${property.name} (${startDate} → ${bookingEnd})`,
      html: teamEmailHtml(fields)
    });

    if (customerEmail) {
      await sendEmail("customer", {
        from,
        to: [customerEmail],
        subject: `Hemos recibido tu solicitud: ${property.name}`,
        html: customerEmailHtml(fields)
      });
    }

    // emailed reflects the notification to Ebrostay; the saved row is the
    // reliable record either way, so a failed email never fails the request.
    // emailError (when present) surfaces the Resend failure code for debugging.
    return json({ ok: true, emailed: teamResult.ok, ...(teamResult.ok ? {} : { emailError: teamResult.error }) });
  } catch (error) {
    console.error("request-booking error", error);
    return json({ error: "server_error" }, 500);
  }
});
