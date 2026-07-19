# CLAUDE.md

Ebrostay — static website for mid-term corporate rentals in Zaragoza (ebrostay.com). Plain HTML/CSS/vanilla JS, **no build step, no framework**, hosted on GitHub Pages. Optional Supabase backend (auth, data, booking requests via Edge Functions); without it the site runs on built-in sample data from `data.js`.

## Commands

- `npm test` — Playwright test suite (`tests/`)
- `npm run test:ui` — Playwright UI mode
- `npm run config` — inject Supabase credentials from `.env` into `supabase-config.js` (never commit real credentials; the template is `supabase-config.template.js`)

## Conventions

- Keep it dependency-free: vanilla JS per page (`site.js`, `property.js`, `booking.js`, …), shared nav in `nav.js`. No bundlers or frameworks.
- Bilingual ES/EN via the in-page translation dictionary — every user-facing string needs both languages.
- Database changes go in `supabase/` as dated `upgrade-*.sql` migration files; `schema.sql` reflects the full schema.
- Payments are intentionally removed: bookings are email-confirmed requests (no Stripe; Revolut Business planned).
- SEO matters: keep per-page meta/JSON-LD, `sitemap.xml`, and `llms.txt` in sync with content changes.

## Skills & plugins

This project ships Claude Code extensions in `.claude/` (available to all devs):

- **frontend-design** (`.claude/skills/frontend-design/`) — visual design guidance for distinctive, non-templated UI. **Use it for any visual/UI work**: new pages or sections, restyling, landing/marketing content. If it hasn't auto-invoked when a task turns out to involve visual design, ask the user whether to apply it before writing markup/CSS.
- **superpowers** (plugin, enabled in `.claude/settings.json`) — workflow skills (brainstorming, planning, TDD, debugging). It self-registers via its own hooks. If a task fits one of its workflows and it hasn't triggered, ask the user whether to use it rather than silently skipping it.
