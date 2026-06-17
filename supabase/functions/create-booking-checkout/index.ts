// Creates a Stripe Checkout session for a booking request.
// Auth: Supabase JWT (verify_jwt). Price, commission and availability are
// computed server-side; the client sends property, dates and tenant names.
// Charge = rent (1-11 whole months) + Ebrostay commission (15% of rent, VAT
// 21% included, capped at one month's rent) + refundable deposit.
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ALLOWED_ORIGINS = ["https://ebrostay.com", "https://www.ebrostay.com", "http://127.0.0.1:8123"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MONTHS = 11;
const COMMISSION_PCT = 0.15;

function addMonthsMinusDay(startDate: string, months: number) {
  const end = new Date(`${startDate}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + months);
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

// Billed months for a stay: whole months from the start date, rounded up,
// minimum one. A stay ending exactly on start + n months - 1 day is n months.
function billedMonths(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (months < 1) months = 1;
  while (addMonthsMinusDay(startDate, months) < endDate) months += 1;
  return months;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "stripe_not_configured" }, 503);
    const stripe = new Stripe(stripeKey);

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

    // Availability: reject if the range overlaps a confirmed block or an
    // active (unexpired) hold from another in-progress checkout.
    const nowIso = new Date().toISOString();
    const { data: overlap } = await admin
      .from("availability_blocks")
      .select("id")
      .eq("property_id", property.id)
      .lte("start_date", bookingEnd)
      .gte("end_date", startDate)
      .or(`hold_expires_at.is.null,hold_expires_at.gt.${nowIso}`)
      .limit(1);
    if (overlap && overlap.length > 0) return json({ error: "dates_unavailable" }, 409);

    const requestOrigin = req.headers.get("origin") || "";
    const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : "https://ebrostay.com";

    const price = Number(property.price_number) || 0;
    const rentTotal = stayMonths * price;
    // Commission: 15% of rent, VAT 21% included, capped at one month's rent.
    const commissionRaw = COMMISSION_PCT * rentTotal;
    const commission = Math.min(commissionRaw, price);
    const commissionCapped = commissionRaw > price + 0.001;
    const depositEur = Number(property.deposit_amount) || 0;

    const names = String(tenantNames || "").trim().slice(0, 800);
    const tenantsListed = names.length > 0;

    const stayLabel = `${startDate} a ${bookingEnd}`;
    const monthsLabel = `${stayMonths} ${stayMonths === 1 ? "mes" : "meses"}`;
    const addressLabel = property.address ? `${property.address}, Zaragoza` : "Zaragoza";

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
      quantity: stayMonths,
      price_data: {
        currency: "eur",
        unit_amount: Math.round(price * 100),
        product_data: {
          name: `Alquiler (${monthsLabel}): ${property.name}`,
          description: `Renta mensual de la vivienda "${property.name}" (${addressLabel}). Estancia del ${startDate} al ${bookingEnd}.` +
            (tenantsListed ? " Inquilinos identificados: estancia exenta de IVA." : " Sin inquilinos nombrados: una reserva a nombre de empresa puede conllevar un 21% de IVA que la empresa autoliquida (no incluido).")
        }
      }
    }];

    // Commission billed as its own line at the net (capped) amount. Stripe
    // Checkout can't show a negative discount line alongside invoice creation,
    // so the full breakdown (15% gross, long-stay cap, final) is itemized in
    // the line description for transparency on the invoice.
    const commissionNetCents = Math.round(commission * 100);
    if (commissionNetCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: commissionNetCents,
          product_data: {
            name: `Comisión y gestión Ebrostay (15%, IVA 21% incl.)`,
            description: commissionCapped
              ? `15% sobre la renta = ${commissionRaw.toFixed(2)} EUR; tope de 1 mes de renta aplicado (descuento por estancia larga −${(commissionRaw - price).toFixed(2)} EUR); comisión final ${price.toFixed(2)} EUR. IVA 21% incluido.`
              : `15% sobre la renta de la vivienda "${property.name}" (${addressLabel}). IVA 21% incluido. Tope: 1 mes de renta (${price} EUR).`
          }
        }
      });
    }

    if (depositEur > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(depositEur * 100),
          product_data: {
            name: `Fianza reembolsable: ${property.name}`,
            description: `Fianza de la vivienda "${property.name}" (${addressLabel}). Se devuelve al finalizar la estancia (${stayLabel}) si no hay incidencias.`
          }
        }
      });
    }

    const vatField = tenantsListed
      ? "Exento (inquilinos identificados)"
      : "Renta sin IVA; empresa autoliquida 21% si aplica";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email || undefined,
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `Reserva Ebrostay - ${property.name} (${addressLabel}). Estancia del ${startDate} al ${bookingEnd} (${monthsLabel}). ` +
            `Comisión y gestión 15% (IVA 21% incl.), tope 1 mes de renta.` +
            (commissionCapped ? ` Tope alcanzado: descuento por estancia larga aplicado.` : "") +
            (depositEur > 0 ? ` Incluye fianza reembolsable de ${depositEur} EUR.` : "") +
            (tenantsListed
              ? ` Inquilinos identificados (renta exenta de IVA): ${names.replace(/\s+/g, " ").slice(0, 280)}.`
              : " Reserva sin inquilinos nombrados: si es a nombre de empresa, se aplica un 21% de IVA sobre la renta que la empresa autoliquida; Ebrostay no lo cobra."),
          custom_fields: [
            { name: "Vivienda", value: property.name.slice(0, 140) },
            { name: "Estancia", value: `${stayLabel} (${monthsLabel})` },
            { name: "IVA renta", value: vatField.slice(0, 140) }
          ],
          footer: "Ebrostay - Zaragoza - info@ebrostay.com. La fianza es reembolsable al finalizar la estancia. La comisión incluye IVA 21%.",
          metadata: { property_id: property.id, start_date: startDate, end_date: bookingEnd }
        }
      },
      line_items: lineItems,
      metadata: {
        user_id: user.id,
        user_email: user.email || "",
        property_id: property.id,
        property_name: property.name,
        start_date: startDate,
        end_date: bookingEnd,
        months: String(stayMonths),
        deposit_eur: String(depositEur),
        commission_eur: commission.toFixed(2),
        tenants_listed: tenantsListed ? "yes" : "no",
        tenant_names: names.slice(0, 480)
      },
      success_url: `${origin}/account.html?booking=success`,
      cancel_url: `${origin}/property.html?id=${property.id}&booking=cancelled`
    });

    // Hold the dates for 30 minutes while the guest completes payment, so a
    // second guest can't start a competing checkout for the same range.
    // Holds (hold_expires_at set) are exempt from the overlap constraint.
    try {
      await admin.from("availability_blocks").delete()
        .eq("property_id", property.id)
        .not("hold_expires_at", "is", null)
        .lt("hold_expires_at", nowIso);
      await admin.from("availability_blocks").insert({
        property_id: property.id,
        start_date: startDate,
        end_date: bookingEnd,
        user_id: user.id,
        note: `hold:${session.id}`,
        hold_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      });
    } catch (holdError) {
      console.error("hold insert failed", holdError);
    }

    return json({ url: session.url });
  } catch (error) {
    console.error("checkout error", error);
    return json({ error: "server_error" }, 500);
  }
});
