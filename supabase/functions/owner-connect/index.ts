// Stripe Connect onboarding for owners. The signed-in owner gets (or resumes)
// an Express connected account and an onboarding link; "status" refreshes
// whether payouts are enabled. verify_jwt = true.
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const ALLOWED_ORIGINS = ["https://ebrostay.com", "https://www.ebrostay.com", "http://127.0.0.1:8123"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "stripe_not_configured" }, 503);
    const stripe = new Stripe(stripeKey);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: profile } = await admin.from("profiles").select("is_owner, email").eq("id", user.id).maybeSingle();
    if (!profile?.is_owner) return json({ error: "not_owner" }, 403);

    const { action } = await req.json().catch(() => ({ action: "onboard" }));
    const { data: existing } = await admin.from("owner_payout_details")
      .select("stripe_account_id, connect_status").eq("owner_id", user.id).maybeSingle();

    const requestOrigin = req.headers.get("origin") || "";
    const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : "https://ebrostay.com";

    try {
      let accountId = existing?.stripe_account_id || null;

      // status: refresh capabilities of an existing account
      if (action === "status") {
        if (!accountId) return json({ status: "none" });
        const account = await stripe.accounts.retrieve(accountId);
        const status = account.payouts_enabled ? "active" : (account.details_submitted ? "pending" : "incomplete");
        await admin.from("owner_payout_details").upsert({
          owner_id: user.id, stripe_account_id: accountId, connect_status: status, updated_at: new Date().toISOString()
        });
        return json({ status, payouts_enabled: account.payouts_enabled });
      }

      // onboard: create the account if needed, return an onboarding link
      if (!accountId) {
        const account = await stripe.accounts.create({
          type: "express",
          country: "ES",
          email: profile.email || user.email || undefined,
          capabilities: { transfers: { requested: true } },
          business_type: "individual",
          metadata: { owner_id: user.id }
        });
        accountId = account.id;
        await admin.from("owner_payout_details").upsert({
          owner_id: user.id, stripe_account_id: accountId, connect_status: "incomplete", updated_at: new Date().toISOString()
        });
      }

      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/partner.html?connect=refresh`,
        return_url: `${origin}/partner.html?connect=done`,
        type: "account_onboarding"
      });
      return json({ url: link.url });
    } catch (stripeError) {
      // Connect must be enabled on the platform account first.
      const message = String((stripeError as Error)?.message || "");
      if (/connect|platform|Only Stripe Connect/i.test(message)) {
        return json({ error: "connect_not_enabled" }, 503);
      }
      console.error("connect error", stripeError);
      return json({ error: "server_error" }, 500);
    }
  } catch (error) {
    console.error("owner-connect error", error);
    return json({ error: "server_error" }, 500);
  }
});
