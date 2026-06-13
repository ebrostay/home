# DeepSeek AI in the property editor

The property editor (`admin-property.html`) can use AI to:

1. **Autofill the form from a document.** Upload a PDF or text file describing
   the home, or paste the text, and the AI fills in the listing fields —
   producing both Spanish and English for every text field. Nothing is saved
   automatically: you review the filled-in fields and press **Save changes**.
2. **Translate while you edit.** The bilingual text fields (area, short
   description, full description, beds, price note) have a ✦ button, and an
   **Auto-translate ES↔EN** toggle (on by default). When the toggle is on,
   editing the Spanish field fills the English one (and vice-versa) as soon as
   you leave the field.

It is powered by the `ai-property-assistant` Edge Function, which calls
[DeepSeek](https://www.deepseek.com/)'s OpenAI-compatible API. The default model
is `deepseek-v4-pro` (higher quality for extraction and copywriting; ≈ $0.435 /
$0.87 per million input/output tokens). The calls are small, so cost stays low.
Set `DEEPSEEK_MODEL` to `deepseek-v4-flash` if you prefer the cheaper model
(≈ $0.14 / $0.28 per million tokens).

PDFs are read **in the browser** with [pdf.js](https://mozilla.github.io/pdf.js/)
(loaded from a CDN in `admin-property.html`), so the function only ever receives
plain text — no file uploads, lower cost, simpler server.

## Setup

1. Create a DeepSeek API key at <https://platform.deepseek.com/> and top up a
   small balance.
2. Add it as an Edge Function secret (never commit it):

   ```bash
   supabase secrets set DEEPSEEK_API_KEY=sk-...
   # optional: pin a specific model id (defaults to deepseek-v4-flash)
   # supabase secrets set DEEPSEEK_MODEL=deepseek-v4-flash
   ```

3. Deploy the function:

   ```bash
   supabase functions deploy ai-property-assistant
   ```

When `DEEPSEEK_API_KEY` is not set, the function returns `ai_not_configured`
and the editor shows a friendly "AI is not configured" message — the rest of
the editor keeps working normally.

## Access & data

- The function requires a signed-in **admin or owner** (it verifies the
  Supabase JWT and the `profiles.is_admin` / `is_owner` flags). It writes
  nothing to the database — it only transforms the text the editor sends.
- **GDPR note:** DeepSeek's hosted API processes requests on servers in China.
  Avoid sending personal data through it (the listing import and translation
  only need property descriptions, not tenant/owner personal data). If you later
  need to process personal data, point `DEEPSEEK_URL` at an EU/US-hosted
  provider of the same model instead of `api.deepseek.com`.
