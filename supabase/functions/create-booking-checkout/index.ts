// Creates a Stripe Checkout session for a booking request.
// Auth: Supabase JWT (verify_jwt). Price and availability are computed
// server-side; the client only sends property, check-in and check-out dates.
// The total charged is the full stay (whole months, rounded up) plus the
// property's deposit when one is set.
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

    const { propertyId, startDate, endDate, months } = await req.json();
    if (!propertyId || !DATE_RE.test(String(startDate || ""))) {
      return json({ error: "bad_request" }, 400);
    }

    const { data: property } = await admin
      .from("properties")
      .select("id, name, price_number, is_published, available_from, deposit_amount, min_stay_months, max_stay_months")
      .eq("id", propertyId)
      .maybeSingle();
    if (!property || !property.is_published) return json({ error: "not_found" }, 404);

    // Clients send a check-out date; older cached clients send a month count.
    let bookingEnd: string;
    if (DATE_RE.test(String(endDate || ""))) {
      bookingEnd = endDate;
    } else {
      const monthCount = Math.max(1, Math.min(12, Number(months) || 0));
      bookingEnd = addMonthsMinusDay(startDate, monthCount);
    }
    if (bookingEnd <= startDate) return json({ error: "bad_request" }, 400);

    const stayMonths = billedMonths(startDate, bookingEnd);
    const maxMonths = Math.min(24, property.max_stay_months || 12);
    if (stayMonths > maxMonths) return json({ error: "bad_request" }, 400);
    if (property.min_stay_months && stayMonths < property.min_stay_months) {
      return json({ error: "bad_request" }, 400);
    }

    const today = new Date().toISOString().slice(0, 10);
    if (startDate < today) return json({ error: "dates_unavailable" }, 409);
    if (property.available_from && startDate < property.available_from) {
      return json({ error: "dates_unavailable" }, 409);
    }

    const { data: overlap } = await admin
      .from("availability_blocks")
      .select("id")
      .eq("property_id", property.id)
      .lte("start_date", bookingEnd)
      .gte("end_date", startDate)
      .limit(1);
    if (overlap && overlap.length > 0) return json({ error: "dates_unavailable" }, 409);

    const requestOrigin = req.headers.get("origin") || "";
    const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : "https://ebrostay.com";

    const stayLabel = `${startDate} a ${bookingEnd}`;
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{
      quantity: stayMonths,
      price_data: {
        currency: "eur",
        unit_amount: Math.round(Number(property.price_number) * 100),
        product_data: {
          name: `Reserva: ${property.name}`,
          description: `Estancia de ${stayMonths} ${stayMonths === 1 ? "mes" : "meses"} (${stayLabel}). Ebrostay, Zaragoza.`
        }
      }
    }];
    const depositEur = Number(property.deposit_amount) || 0;
    if (depositEur > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(depositEur * 100),
          product_data: {
            name: `Fianza: ${property.name}`,
            description: `Fianza reembolsable de la estancia (${stayLabel}).`
          }
        }
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email || undefined,
      invoice_creation: { enabled: true },
      line_items: lineItems,
      metadata: {
        user_id: user.id,
        user_email: user.email || "",
        property_id: property.id,
        property_name: property.name,
        start_date: startDate,
        end_date: bookingEnd,
        months: String(stayMonths),
        deposit_eur: String(depositEur)
      },
      success_url: `${origin}/account.html?booking=success`,
      cancel_url: `${origin}/property.html?id=${property.id}&booking=cancelled`
    });

    return json({ url: session.url });
  } catch (error) {
    console.error("checkout error", error);
    return json({ error: "server_error" }, 500);
  }
});
