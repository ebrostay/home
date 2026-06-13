// AI helper for the property editor, powered by DeepSeek (OpenAI-compatible API).
// Auth: Supabase JWT. Only admins or owners may call it. No data is written —
// it only transforms text the editor sends.
//
// Actions:
//   - "extract": parse a pasted document (from a PDF or text file) into the
//     listing fields, producing both Spanish and English for every text field.
//   - "translate": translate one field value between Spanish and English.
//   - "describe": write a listing description (ES + EN) from the known facts
//     and, optionally, the property photos (DeepSeek vision) — used when the
//     uploaded file had no description text of its own.
//
// Set DEEPSEEK_API_KEY as an Edge Function secret. The model can be overridden
// with DEEPSEEK_MODEL (defaults to deepseek-v4-pro).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = Deno.env.get("DEEPSEEK_MODEL") || "deepseek-v4-pro";
const MAX_INPUT = 24000;

const TYPE_KEYS = ["apartment", "room", "home"];
const ENERGY_RATINGS = ["A", "B", "C", "D", "E", "F", "G"];
const AMENITY_KEYS = ["wifi", "desk", "balcony", "lift", "ac", "heating", "kitchen", "terrace", "washer", "dishwasher", "tv", "microwave", "oven", "parking"];

const STRING_FIELDS = [
  "name", "area_es", "area_en", "copy_es", "copy_en", "details_es", "details_en",
  "beds_es", "beds_en", "price_note_es", "price_note_en", "city", "address"
];
const NUMBER_FIELDS = [
  "guests", "bedrooms", "bathrooms", "size_m2", "floor_number", "price_number",
  "deposit_amount", "upfront_rent_eur", "utilities_cap_eur", "min_stay_months", "max_stay_months"
];

async function callDeepseek(apiKey: string, messages: unknown[], jsonMode: boolean) {
  const response = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 2000,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {})
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`deepseek ${response.status}: ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  return String(data.choices?.[0]?.message?.content || "");
}

function extractJson(text: string): Record<string, unknown> {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* give up */ }
  }
  return {};
}

// Turn the known structured fields into a compact, readable fact sheet for the
// copywriter prompt. Only facts we actually have are included.
function buildFactsString(f: Record<string, unknown>): string {
  const lines: string[] = [];
  const typeLabel: Record<string, string> = { apartment: "apartment", room: "private room", home: "house" };
  const add = (label: string, value: unknown) => {
    if (value != null && String(value).trim() !== "") lines.push(`${label}: ${value}`);
  };
  if (typeof f.type === "string" && typeLabel[f.type]) add("Type", typeLabel[f.type]);
  add("Area / neighbourhood", f.area_en || f.area_es);
  add("Address", f.address);
  add("City", f.city);
  add("Bedrooms", f.bedrooms);
  add("Bathrooms", f.bathrooms);
  if (f.size_m2 != null && f.size_m2 !== "") add("Size", `${f.size_m2} m2`);
  if (f.floor_number != null && f.floor_number !== "") add("Floor", Number(f.floor_number) === 0 ? "ground" : f.floor_number);
  add("Sleeps", f.guests);
  add("Beds", f.beds_en || f.beds_es);
  if (Array.isArray(f.amenities) && f.amenities.length) add("Amenities", f.amenities.join(", "));
  if (f.price_number != null && f.price_number !== "") add("Price", `${f.price_number} EUR/month`);
  add("Minimum stay (months)", f.min_stay_months);
  add("Energy rating", f.energy_rating);
  const nl = String.fromCharCode(10);
  return "Property facts:" + nl + lines.join(nl);
}

function sanitizeFields(obj: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const key of STRING_FIELDS) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  for (const key of NUMBER_FIELDS) {
    const value = obj[key];
    const num = Number(value);
    if (value != null && value !== "" && Number.isFinite(num)) out[key] = num;
  }
  const type = obj.type;
  if (typeof type === "string" && TYPE_KEYS.includes(type)) out.type = type;
  const energy = obj.energy_rating;
  if (typeof energy === "string" && ENERGY_RATINGS.includes(energy.toUpperCase())) {
    out.energy_rating = energy.toUpperCase();
  }
  if (Array.isArray(obj.amenities)) {
    const list = [...new Set(
      obj.amenities.filter((value): value is string => typeof value === "string" && AMENITY_KEYS.includes(value))
    )];
    if (list.length) out.amenities = list;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) return json({ error: "ai_not_configured" }, 503);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin, is_owner, deactivated_at")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.deactivated_at) return json({ error: "unauthorized" }, 401);
    if (!profile.is_admin && !profile.is_owner) return json({ error: "forbidden" }, 403);

    const body = await req.json();
    const action = body?.action;

    if (action === "translate") {
      const text = String(body.text || "").slice(0, MAX_INPUT);
      if (!text.trim()) return json({ text: "" });
      const source = body.source === "en" ? "English" : "Spanish";
      const target = body.target === "en" ? "English" : "Spanish";
      const messages = [
        {
          role: "system",
          content: `You translate text for a furnished mid-term rental listing site in Zaragoza, Spain. Translate the user's text from ${source} to ${target}. Preserve the meaning, tone, and any numbers, currencies and units exactly. Do not add, remove or explain anything. Return only the translated text, with no surrounding quotes.`
        },
        { role: "user", content: text }
      ];
      const out = await callDeepseek(apiKey, messages, false);
      return json({ text: out.trim() });
    }

    if (action === "extract") {
      const text = String(body.text || "").slice(0, MAX_INPUT);
      if (!text.trim()) return json({ fields: {} });
      const system = `You extract structured data for a furnished mid-term rental listing in Zaragoza, Spain, from a document the user pastes (often a property-portal export such as Idealista or Fotocasa). Ignore portal boilerplate: navigation, "N photos", "Map", reference numbers, advertiser names, URLs, dates, cookie/error notices and chat prompts. Return ONLY a JSON object (no markdown fences) with any of these keys you can determine; omit keys you cannot. Provide BOTH Spanish and English for every text field.
Keys:
- name (a clean, appealing short title WITHOUT words like "for rent", reference numbers or the full address, e.g. "Bright 2-bedroom apartment in San José")
- type (one of: ${TYPE_KEYS.join(", ")})
- guests, bedrooms, bathrooms, size_m2, floor_number (plain numbers; floor 0 = ground; for size use the built area if both built and usable areas are given)
- price_number, deposit_amount, upfront_rent_eur, utilities_cap_eur (plain numbers in EUR, no symbols)
- min_stay_months, max_stay_months (plain numbers)
- energy_rating (one of ${ENERGY_RATINGS.join(", ")})
- area_es, area_en (neighbourhood / district, e.g. "San José")
- copy_es, copy_en (one short inviting sentence)
- details_es, details_en (a full, appealing paragraph that COMBINES the listing's own description with EVERY other notable detail you found that has no dedicated field here — for example exterior/interior, orientation, condition, heating/AC type, lift or no lift, furnished, nearby transport and services, and views. Do not lose information.)
- beds_es, beds_en (bed configuration if stated)
- price_note_es, price_note_en (short optional price note, e.g. community fees)
- city (string), address (street and number, only if clearly present)
- amenities (array, ONLY those explicitly present, from this set: ${AMENITY_KEYS.join(", ")}; never include a feature that is negated, e.g. "no lift")
Rules: stay truthful to the document — never invent amenities, prices or numbers. If a value exists in only one language, translate it for the other.`;
      const messages = [
        { role: "system", content: system },
        { role: "user", content: text }
      ];
      const out = await callDeepseek(apiKey, messages, true);
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(out); } catch { parsed = {}; }
      return json({ fields: sanitizeFields(parsed) });
    }

    // Write an appealing description from the known facts + (optionally) photos,
    // used when the uploaded file had no description text of its own.
    if (action === "describe") {
      const fields = (body.fields && typeof body.fields === "object") ? body.fields : {};
      const images: string[] = (Array.isArray(body.images) ? body.images : [])
        .filter((url: unknown) => typeof url === "string" && url.startsWith("data:image/") && url.length < 3_000_000)
        .slice(0, 3);
      const facts = buildFactsString(fields).slice(0, 4000);
      const system = `You are a copywriter for Ebrostay, furnished mid-term (1–12 month) corporate rentals in Zaragoza, Spain, aimed at relocating professionals and companies. Write an appealing but truthful listing description from the facts provided${images.length ? " and the attached photos" : ""}. Only mention features that are in the facts or clearly visible in the photos — never invent amenities, sizes, prices, views or neighbourhoods. Warm, professional and concise. Return ONLY a JSON object with keys: copy_es, copy_en (one inviting sentence each) and details_es, details_en (one paragraph of 3–5 sentences each). Provide both Spanish and English.`;

      const userContent: unknown[] = [{ type: "text", text: facts }];
      for (const url of images) userContent.push({ type: "image_url", image_url: { url } });

      let out = "";
      try {
        out = await callDeepseek(apiKey, [
          { role: "system", content: system },
          { role: "user", content: images.length ? userContent : facts }
        ], false);
      } catch (error) {
        // The model may reject image input; retry once with facts only.
        if (images.length) {
          out = await callDeepseek(apiKey, [
            { role: "system", content: system },
            { role: "user", content: facts }
          ], false);
        } else {
          throw error;
        }
      }

      const parsed = extractJson(out);
      const result: Record<string, string> = {};
      for (const key of ["copy_es", "copy_en", "details_es", "details_en"]) {
        if (typeof parsed[key] === "string" && (parsed[key] as string).trim()) {
          result[key] = (parsed[key] as string).trim();
        }
      }
      return json({ fields: result });
    }

    return json({ error: "bad_request" }, 400);
  } catch (error) {
    console.error("ai-property-assistant error", error);
    return json({ error: "server_error" }, 500);
  }
});
