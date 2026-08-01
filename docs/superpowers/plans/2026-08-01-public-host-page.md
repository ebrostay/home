# Public `/host` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/host` serve an owner pitch with a sign-in button when signed out, and the portfolio when signed in, so the "Manage Property" nav segment highlights in both states and a bookmarked `/host` never dead-ends on a bare login form.

**Architecture:** `/host` stops being gated by Static Web Apps and becomes one route with two faces. The page already models this — `HostPage` carries a `{ kind: "signedOut" }` state set when `fetchHostProperties()` returns 401 — but the state is unreachable behind the SWA gate and renders a two-line dead-end notice. We make it reachable and give it real content. The nav item collapses from an auth-dependent pair of destinations to a single constant href, which is what makes the highlight stop disappearing. Authorization is unaffected: it is enforced in the C# functions reading `x-ms-client-principal`, never by the route rules, so ungating the HTML shell exposes nothing.

**Tech Stack:** Next.js App Router with `output: "export"`, TypeScript, Tailwind v4, next-intl, Azure Static Web Apps route config, vitest (`app/lib`), Playwright (`app/e2e`).

## Global Constraints

- **Bilingual ES/EN is a hard requirement.** Every user-facing string goes in `app/messages/es.json` **and** `app/messages/en.json`. Spanish is the default locale.
- Import `Link` / `useRouter` / `usePathname` from `@/i18n/navigation`, never from `next/link` or `next/navigation`.
- Static export: no middleware, no route handlers, no server components at runtime. Dynamic data is fetched client-side from `/api/*`.
- `cd app && npm run build` must stay green.
- Light and dark mode are both first-class. Theme is `data-theme` on `<html>`; use the Tailwind `dark:` variant, never `@media (prefers-color-scheme)`.
- Never link a signed-out visitor straight to `/.auth/login`. Go through our own `/sign-in`, via `signInPath()` from `@/lib/auth` — the Entra hosted page offers email/password only, so a Microsoft user sent directly would be stranded (`AuthMenu.tsx:24`).
- Authorization is enforced in the C# functions, never only via SWA route rules or UI gates.
- Colours come from the CSS custom properties in `app/app/globals.css` (`--brand`, `--ink`, `--body-text`, `--muted`, `--line`, `--surface`) through their Tailwind utilities (`text-ink`, `border-line`, `bg-surface`, …). No raw hex in components.

## Decisions already settled

| # | Decision |
|---|---|
| 1 | `/host` becomes dynamic. No new route, no `/owners` page. |
| 2 | The MainNav `list` segment highlights in both auth states. |
| 3 | `/about` keeps its `#hosts` section **and** its existing link. Nothing moves out of `/about`. |
| 4 | The locale bug in the signed-out redirect gets fixed (see Task 6 — this is the one judgement call). |
| 5 | The dead `/about` → `/account` link is **not** fixed here. It goes in the backlog. |
| 6 | The public `/host` gets an owner "how it works" — numbered steps, from `hostsPoints`, extended — plus a prominent sign-in button. |

## Assumption to confirm at Checkpoint A

Decision 6 said "take what's in the how it works page". The `how` section on `/about` is the **guest** journey (Filter / Review / Request — searching and booking). The owner journey already exists as `hostsPoints` ("Sign in and create your listing" / "Our team reviews every listing" / "Manage availability and booking requests"). This plan takes the *numbered-steps treatment* of the `how` section and fills it with owner content, extended to four steps. If the intent was the literal guest steps, stop at Checkpoint A and say so.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/lib/nav.ts` | **Create.** The nav model as pure data: `NAV_ITEMS`, `navMatch()`. Pure so vitest can cover the matcher — the bug being fixed lives here. |
| `app/lib/nav.test.ts` | **Create.** Unit tests for `navMatch()` across every route the app has. |
| `app/components/site/MainNav.tsx` | **Modify.** Import the model from `@/lib/nav`; drop `useAuth`; render only. |
| `app/components/host/HostPitch.tsx` | **Create.** The signed-out owner pitch: heading, lead, numbered steps, sign-in CTA. |
| `app/app/[locale]/host/page.tsx` | **Modify.** Render `HostPitch` instead of the owner chrome when signed out. |
| `app/messages/es.json`, `app/messages/en.json` | **Modify.** New `host.pitch.*` strings, both locales. |
| `app/public/staticwebapp.config.json` | **Modify.** Ungate `/host`; handle the child routes and the 401 locale bug. |
| `app/e2e/pages.spec.ts` | **Modify.** A signed-out `/host` case asserting the pitch, alongside the existing signed-in case. |
| `docs/BACKLOG.md` | **Modify.** The `/account` dead-link entry. |

---

## Checkpoints

Four review gates. Stop at each, show the work, wait for a verdict.

- **Checkpoint A** — after Task 2. Copy and nav model reviewed before any UI is built. Cheapest place to catch a wrong reading of Decision 6.
- **Checkpoint B** — after Task 5. The page reviewed in a browser, both locales, both themes, signed out and signed in.
- **Checkpoint C** — after Task 6. The SWA config and the auth-redirect judgement call, reviewed before it reaches a deploy.
- **Checkpoint D** — after Task 8. Full verification, everything green, ready to commit.

---

## Task 1: Backlog entry for the dead `/account` link

Settles Decision 5. No code, no test cycle — it exists so the item is recorded before we start touching neighbouring files and forget.

**Files:**
- Modify: `docs/BACKLOG.md` (the `## Auth & accounts` section, currently line 259)

- [ ] **Step 1: Add the entry**

Append to the end of the `## Auth & accounts` section, after the "Self-service deactivation" bullet:

```markdown
- **[P][S]** **`/about`'s "List my home" CTA is a 404** — `app/[locale]/about/page.tsx`
  links to `/account`, a route that has never existed (the comment beside it
  still says "wired to /.auth in the auth task"). Point it at `/host`, which
  since 2026-08-01 serves the owner pitch to signed-out visitors, or build the
  account page the link was written for. Left alone deliberately when `/host`
  was made public.
```

- [ ] **Step 2: Commit**

```bash
git add docs/BACKLOG.md
git commit -m "docs(backlog): the about page's list-my-home CTA points at a route that never existed"
```

---

## Task 2: The nav model as testable data

The matcher is the actual bug — `match: (p) => p.startsWith("/host")` never fires because the signed-out href goes to `/about#hosts`. It currently lives inside a `"use client"` component that imports `lucide-react` and `next-intl`, so nothing can test it. Move the model to `app/lib`, where `npm test` already runs.

**Files:**
- Create: `app/lib/nav.ts`
- Create: `app/lib/nav.test.ts`
- Modify: `app/components/site/MainNav.tsx`

**Interfaces:**
- Produces: `NAV_ITEMS: readonly NavItem[]` where `NavItem = { key: "find" | "list" | "how"; href: string; match: (pathname: string) => boolean; icon: "search" | "building" | null }`. `navMatch(pathname: string): NavItem["key"] | null` returns the key of the segment that should be highlighted, or `null`.
- Consumes: nothing.

Note the shape change: `href` is now a **string**, not a function of `authed`, and the icon is a **string tag** rather than a component, so `lib/nav.ts` stays free of React imports. `MainNav` maps the tag to the component.

- [ ] **Step 1: Write the failing test**

Create `app/lib/nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navMatch } from "./nav";

describe("navMatch", () => {
  it("highlights find on the search page", () => {
    expect(navMatch("/")).toBe("find");
  });

  // The bug this file exists for: signed out, "Manage Property" used to point
  // at /about#hosts, which no matcher recognised, so the pill went blank.
  // There is now one destination in both auth states.
  it("highlights list on the owner route in both auth states", () => {
    expect(navMatch("/host")).toBe("list");
  });

  it("highlights list on every owner sub-route", () => {
    expect(navMatch("/host/new")).toBe("list");
    expect(navMatch("/host/edit")).toBe("list");
    expect(navMatch("/host/manage")).toBe("list");
  });

  it("highlights nothing on pages no segment owns", () => {
    expect(navMatch("/about")).toBeNull();
    expect(navMatch("/privacy")).toBeNull();
    expect(navMatch("/sign-in")).toBeNull();
    expect(navMatch("/property")).toBeNull();
  });

  // "How it works" is an anchor on /about, which "About" does not own either.
  // It is deliberately never highlighted — asserted so a later change to make
  // it highlight is a decision someone makes, not one they trip over.
  it("never highlights how it works", () => {
    expect(navMatch("/about")).not.toBe("how");
  });

  it("sends the owner segment to one place", () => {
    const list = NAV_ITEMS.find((i) => i.key === "list");
    expect(list?.href).toBe("/host");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd app && npx vitest run lib/nav.test.ts`
Expected: FAIL — `Failed to resolve import "./nav"`.

- [ ] **Step 3: Write the model**

Create `app/lib/nav.ts`:

```ts
// The primary decision — am I looking for a home, or do I have one to let? —
// rendered by MainNav as a segmented control. The model lives here, apart
// from the component, because the matcher is logic and logic gets tested:
// between 2026-07-2x and 2026-08-01 the owner segment pointed at
// /about#hosts when signed out while its matcher only recognised /host, so
// the pill silently went blank for every signed-out visitor and no test could
// see it.
//
// ONE href per segment, in every auth state. /host serves the owner pitch to
// a signed-out visitor and the portfolio to a signed-in one (see
// components/host/HostPitch.tsx), so there is no second destination left to
// disagree with the matcher.

export type NavKey = "find" | "list" | "how";

export type NavItem = {
  key: NavKey;
  href: string;
  match: (pathname: string) => boolean;
  // A tag, not a component: this module stays free of React so vitest can
  // load it without a DOM. MainNav maps the tag to the icon.
  icon: "search" | "building" | null;
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "find",
    href: "/",
    match: (p) => p === "/",
    icon: "search",
  },
  {
    key: "list",
    href: "/host",
    match: (p) => p === "/host" || p.startsWith("/host/"),
    icon: "building",
  },
  // An anchor on /about, which no segment owns — /about is also where "About"
  // in the footer goes. Highlighting it would mean highlighting on arrival
  // from either, so it highlights on neither.
  {
    key: "how",
    href: "/about#how",
    match: () => false,
    icon: null,
  },
] as const;

export function navMatch(pathname: string): NavKey | null {
  return NAV_ITEMS.find((item) => item.match(pathname))?.key ?? null;
}
```

Note `match` for `list` is `p === "/host" || p.startsWith("/host/")` rather than a bare `startsWith("/host")`, so a future `/hosts` or `/hosting` route cannot silently light up the owner segment.

- [ ] **Step 4: Run the test and make sure it passes**

Run: `cd app && npx vitest run lib/nav.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Rewrite MainNav against the model**

Replace the whole of `app/components/site/MainNav.tsx` with:

```tsx
"use client";

import { Search, Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { NAV_ITEMS, navMatch } from "@/lib/nav";

// The primary decision — am I looking for a home, or do I have one to let? —
// reads as a segmented control in the header rather than a row of links, so
// the two audiences are visibly a choice between siblings. "How it works"
// rides along as the third, quieter segment.
//
// The model, including which segment is active for a path, is lib/nav.ts.
// This file is rendering only. The owner segment points at /host in every
// auth state: signed out that route is the pitch, signed in it is the
// portfolio.
//
// THE CONTROL NEVER LEAVES THE BAR. It gets smaller instead, in three steps,
// and what it gives up is ordered by how much each thing is worth: the third
// segment before the words, the words before the choice itself. At 320px it
// is two icons, but it is still there, and the decision it carries is still
// one tap away. What moves into CompactNav's popover is whatever the bar has
// just dropped — the two never show the same thing twice.
//
//   ≥54rem  find · manage · how it works, and ES|EN and the theme in the bar
//   ≥46rem  the same three, ES|EN and theme now in the popover
//   ≥28rem  "Buscar" · "Gestionar", how it works now in the popover
//    <28rem the same two as icons          (ES is the wide case: 168px / 95px)
const ICONS = { search: Search, building: Building2 } as const;

export function MainNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const activeKey = navMatch(pathname);

  return (
    <nav
      aria-label={t("mainNav")}
      className="flex shrink-0 items-center gap-[3px] rounded-full border border-line bg-surface-2 p-1"
    >
      {NAV_ITEMS.map(({ key, href, icon }) => {
        const active = key === activeKey;
        const Icon = icon ? ICONS[icon] : null;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            // The full label is the accessible name at every step, so the
            // icons are named and the short labels ("Buscar") stay contained
            // in the name they shrank from ("Buscar vivienda").
            aria-label={t(`pill.${key}`)}
            title={t(`pill.${key}`)}
            className={`flex items-center rounded-full px-[13px] py-[7px] text-[0.84375rem] transition-colors duration-(--dur-standard) ${
              Icon ? "" : "hidden min-[46rem]:flex"
            } ${
              active
                ? "bg-brand-soft font-semibold text-brand-strong shadow-[inset_0_0_0_1px_var(--brand)]"
                : "font-medium text-muted hover:text-ink"
            }`}
          >
            {/* "How it works" has no short form and no icon: it is already
                gone by the time either would be needed, so asking for a
                pillShort.how message would only be asking for one that has no
                reason to exist. */}
            {Icon && (
              <>
                <Icon size={16} strokeWidth={2} aria-hidden className="min-[28rem]:hidden" />
                <span className="hidden min-[28rem]:inline min-[46rem]:hidden">
                  {t(`pillShort.${key}` as "pillShort.find")}
                </span>
              </>
            )}
            <span className={Icon ? "hidden min-[46rem]:inline" : ""}>{t(`pill.${key}`)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 6: Check nothing else imported the old export**

Run: `cd app && grep -rn "NAV_ITEMS" --include="*.tsx" --include="*.ts" . | grep -v node_modules`
Expected: only `lib/nav.ts`, `lib/nav.test.ts` and `components/site/MainNav.tsx`. If `CompactNav.tsx` imports it from `./MainNav`, repoint that import at `@/lib/nav` too.

- [ ] **Step 7: Typecheck and lint**

Run: `cd app && npm run build && npm run lint`
Expected: build green. Lint reports the 4 pre-existing errors in `app/[locale]/page.tsx`, `app/[locale]/property/page.tsx` and `app/not-found.tsx` — and nothing in the files you touched.

- [ ] **Step 8: Write the pitch copy, both locales**

In `app/messages/en.json`, inside the existing `"host"` object, add a `"pitch"` key. Keep `"signedOut"` in place for now — Task 5 removes it.

```json
"pitch": {
  "eyebrow": "FOR OWNERS",
  "title": "List your home.",
  "lead": "Anyone with an account can list on Ebrostay. You bring the home; we bring the bridge to the companies that need it — mid-term tenants, checked before they reach you.",
  "steps": [
    { "title": "Sign in", "copy": "Create an account or sign in with the one you have. It takes a minute and costs nothing." },
    { "title": "Describe the home", "copy": "Photos, monthly price, and the months it is free. Our import can read an existing listing and fill most of it for you." },
    { "title": "We review it", "copy": "Our team checks every listing before it goes live — the address, the photos, and that both languages read well." },
    { "title": "Take requests", "copy": "Manage availability and booking requests from your dashboard. You confirm the final price on each one." }
  ],
  "cta": "Sign in to list your home",
  "ctaSignedIn": "Go to your portfolio"
}
```

In `app/messages/es.json`, the same key with Spanish copy:

```json
"pitch": {
  "eyebrow": "PARA PROPIETARIOS",
  "title": "Publica tu vivienda.",
  "lead": "Cualquier persona con una cuenta puede publicar en Ebrostay. Tú pones la vivienda; nosotros el puente hacia las empresas que la necesitan — inquilinos de media estancia, verificados antes de llegar a ti.",
  "steps": [
    { "title": "Inicia sesión", "copy": "Crea una cuenta o entra con la que ya tienes. Lleva un minuto y no cuesta nada." },
    { "title": "Describe la vivienda", "copy": "Fotos, precio mensual y los meses libres. Nuestra importación puede leer un anuncio existente y rellenar casi todo por ti." },
    { "title": "La revisamos", "copy": "Nuestro equipo revisa cada anuncio antes de publicarlo — la dirección, las fotos y que ambos idiomas se lean bien." },
    { "title": "Recibe solicitudes", "copy": "Gestiona disponibilidad y solicitudes desde tu panel. Tú confirmas el precio final en cada una." }
  ],
  "cta": "Inicia sesión para publicar tu vivienda",
  "ctaSignedIn": "Ir a tu panel"
}
```

- [ ] **Step 9: Verify both files still parse and the keys match**

Run:

```bash
cd app && python3 -c "
import json
es = json.load(open('messages/es.json')); en = json.load(open('messages/en.json'))
a, b = es['host']['pitch'], en['host']['pitch']
assert sorted(a) == sorted(b), (sorted(a), sorted(b))
assert len(a['steps']) == len(b['steps']) == 4
print('ok', sorted(a))
"
```

Expected: `ok ['cta', 'ctaSignedIn', 'eyebrow', 'lead', 'steps', 'title']`

- [ ] **Step 10: Commit**

```bash
git add app/lib/nav.ts app/lib/nav.test.ts app/components/site/MainNav.tsx app/messages/es.json app/messages/en.json
git commit -m "refactor(nav): the segmented control's model moves to lib and gains one owner href"
```

---

## ⛳ Checkpoint A — copy and nav model

Show:
- `npx vitest run lib/nav.test.ts` output.
- The four ES and four EN step titles, side by side.
- The assumption flagged at the top of this plan: owner steps, not the guest Filter/Review/Request.

Ask: is the copy right, and is that the intended reading of Decision 6? **Wait for a verdict before Task 3.**

---

## Task 3: The HostPitch component

**Files:**
- Create: `app/components/host/HostPitch.tsx`

**Interfaces:**
- Consumes: `signInPath`, `currentPath` from `@/lib/auth`; `useAuth` from `@/components/site/AuthProvider`; `host.pitch.*` from Task 2.
- Produces: `<HostPitch />`, default-exportless named export, no props.

The CTA follows the house convention exactly: `<Link>` from `@/i18n/navigation` (which adds the locale prefix) wrapping `signInPath(currentPath())` (which carries the destination through the round trip). `currentPath()` returns `""`-safe output on the server — it guards `typeof window === "undefined"` — but it is still read in an effect rather than during render, because the value differs between the prerendered HTML and the browser and would otherwise be a hydration mismatch.

- [ ] **Step 1: Write the component**

Create `app/components/host/HostPitch.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/components/site/AuthProvider";
import { currentPath, signInPath } from "@/lib/auth";

// What /host is to someone who is not signed in. The route is public since
// 2026-08-01: an owner following an old bookmark used to be 401'd by the SWA
// gate and dropped on a bare sign-in form, which answers a question they had
// not asked yet. This answers it first, and puts the sign-in button under the
// answer.
//
// The steps are the owner's journey, deliberately not the guest's — /about's
// "how it works" is Filter / Review / Request, which is what a tenant does.
export function HostPitch() {
  const t = useTranslations("host.pitch");
  const { me, loading } = useAuth();

  // Read in an effect, not during render: this page is prerendered at build
  // time and window.location does not exist there, so a value read during
  // render would disagree with the server's HTML on hydration.
  const [back, setBack] = useState("/");
  useEffect(() => setBack(currentPath()), []);

  const steps = t.raw("steps") as { title: string; copy: string }[];

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="data text-xs uppercase tracking-[0.16em] text-muted">
        {t("eyebrow")}
      </p>
      <h1 className="mt-2 max-w-3xl font-display text-4xl font-bold tracking-[-0.015em] text-ink">
        {t("title")}
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed">{t("lead")}</p>

      <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="rounded-(--radius-card) border border-line bg-surface p-6 shadow-(--shadow-card)"
          >
            <p className="data text-xs text-muted">0{i + 1}</p>
            <h2 className="mt-2 font-display text-lg font-semibold text-ink">
              {step.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed">{step.copy}</p>
          </li>
        ))}
      </ol>

      {/* The button is the point of the page, so it sits under the answer
          rather than in the header where a nav item would be. A skeleton for
          the one tick AuthProvider takes to resolve: rendering "Sign in" to
          someone who already is, then swapping it, is the same flash we spend
          effort removing elsewhere. */}
      <div className="mt-10">
        {loading ? (
          <div className="skeleton h-[42px] w-60 rounded-(--radius-control)" />
        ) : me.authenticated ? (
          <Link
            href="/host"
            className="inline-flex h-[42px] items-center rounded-(--radius-control) bg-brand px-[18px] text-sm font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong"
          >
            {t("ctaSignedIn")}
          </Link>
        ) : (
          <Link
            href={signInPath(back)}
            className="inline-flex h-[42px] items-center rounded-(--radius-control) bg-brand px-[18px] text-sm font-semibold text-white transition-colors duration-(--dur-standard) hover:bg-brand-strong"
          >
            {t("cta")}
          </Link>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run build`
Expected: green. The component is not rendered anywhere yet, so this only proves it compiles.

- [ ] **Step 3: Commit**

```bash
git add app/components/host/HostPitch.tsx
git commit -m "feat(host): the owner pitch a signed-out visitor sees at /host"
```

---

## Task 4: Render the pitch instead of the owner chrome

The signed-out branch currently renders *inside* the owner layout — under an `<h1>Manage Property</h1>` and beside an "Add property" button pointing at a route the visitor cannot reach. The pitch has to replace that chrome, not sit under it.

**Files:**
- Modify: `app/app/[locale]/host/page.tsx`

**Interfaces:**
- Consumes: `HostPitch` from Task 3.

- [ ] **Step 1: Import the pitch and the auth state**

In `app/app/[locale]/host/page.tsx`, add to the imports:

```tsx
import { useAuth } from "@/components/site/AuthProvider";
import { HostPitch } from "@/components/host/HostPitch";
```

- [ ] **Step 2: Return the pitch before the owner layout**

Add near the top of `HostPage`, beside the other hooks:

```tsx
  const { me, loading: authLoading } = useAuth();
```

and immediately before the `return (` — after the `pending` const, before the JSX — insert:

```tsx
  // Signed out, this route is not the portfolio at all: it is the pitch, with
  // its own <main>. Returning before the owner chrome is deliberate — the
  // signed-out branch used to render a notice *under* an <h1>Manage
  // Property</h1> and beside an "Add property" button that led somewhere the
  // visitor could not go.
  //
  // Driven by /api/me rather than by the portfolio's own 401, because the two
  // arrive at different times: AuthProvider is already fetching /api/me when
  // this page mounts, while `state` sits in `loading` until the owner
  // endpoint answers. Waiting for the 401 would paint the owner chrome —
  // "Manage Property", "Add property" — at a stranger for as long as that
  // request takes, then swap it for the pitch. The 401 is still honoured
  // below as the late signal it is: a session that expired mid-visit.
  if (!authLoading && !me.authenticated) return <HostPitch />;
  if (state.kind === "signedOut") return <HostPitch />;
```

- [ ] **Step 3: Delete the dead branch**

Remove the now-unreachable block:

```tsx
      {state.kind === "signedOut" && (
        <Notice title={t("signedOut.title")} body={t("signedOut.body")} />
      )}
```

- [ ] **Step 4: Delete the orphaned strings**

Remove `"signedOut"` (both `title` and `body`) from the `"host"` object in `app/messages/es.json` and `app/messages/en.json`. Nothing references them once Step 3 lands.

- [ ] **Step 5: Prove nothing still references them**

Run: `cd app && grep -rn "signedOut" --include="*.tsx" --include="*.ts" --include="*.json" . | grep -v node_modules`
Expected: only `app/[locale]/host/page.tsx`, and only the `State` union member and the `if` from Step 2 — no `t("signedOut...")` and no message keys.

- [ ] **Step 6: Build**

Run: `cd app && npm run build && npm test`
Expected: build green, 209 + 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/app/[locale]/host/page.tsx app/messages/es.json app/messages/en.json
git commit -m "feat(host): a signed-out visitor gets the pitch, not the portfolio's chrome"
```

---

## Task 5: See it in a browser

No new code. This task exists because the previous three cannot be trusted on a typecheck alone, and because Checkpoint B needs evidence.

**Files:** none.

- [ ] **Step 1: Start the stack**

The SWA emulator is the app; `:3000` has no `/api/*` and will show the pitch for the wrong reason (every API call 404s, which reads as 401 to nothing). Use:

```bash
npx swa start http://localhost:3000 --api-devserver-url http://localhost:7071
```

with `npm run dev --prefix app` and `func start` (from `api/`) already running.

- [ ] **Step 2: Look at it signed out**

`/host` is still gated at this point — Task 6 removes the gate — so `http://localhost:4280/es/host/` still bounces to sign-in. Confirm that bounce happens (it is the bug Task 6 fixes), then view the page itself at `http://localhost:3000/es/host`: the dev server has no `/api/*`, so `fetchMe()` falls back to `ANON` and the pitch renders on exactly the path a real signed-out visitor takes. Do **not** stop the Functions host to force this — it is the user's process and nothing here needs it down.

- [ ] **Step 3: Check both locales, both themes**

`/es/host` and `/en/host`, each in light and dark. Confirm: four numbered steps, the CTA reads "Inicia sesión para publicar tu vivienda" / "Sign in to list your home", and no `host.pitch.*` key leaks through as raw text.

- [ ] **Step 4: Check the nav pill**

On `/host` in both auth states, the "Manage Property" segment must be the highlighted one — `bg-brand-soft` with the inset brand ring. This is the reported bug; confirm it directly.

- [ ] **Step 5: Check the console**

Zero errors beyond the two known dev-only `Encountered a script tag while rendering React component` warnings from the theme bootstrap.

---

## ⛳ Checkpoint B — the page

Show screenshots: `/es/host` and `/en/host` signed out, light and dark; the header with the pill correctly highlighted. **Wait for a verdict before Task 6.**

---

## Task 6: SWA routing, and the 401 locale bug

**This task carries the one judgement call in the plan. Read the rationale before implementing.**

**Files:**
- Modify: `app/public/staticwebapp.config.json`
- Modify: `app/app/[locale]/host/new/page.tsx`, `app/app/[locale]/host/edit/page.tsx`, `app/app/[locale]/host/manage/page.tsx`

### Rationale

Today `/es/host/*` and `/en/host/*` carry `allowedRoles: ["authenticated"]`. A signed-out request gets 401, and the single global `responseOverrides.401` sends it to `/es/sign-in/`. Measured:

```
/es/host/      -> 302 /es/sign-in/
/en/host/      -> 302 /es/sign-in/     ← English visitor, Spanish page
/es/host/new/  -> 302 /es/sign-in/
```

`responseOverrides` is a **single global map** in Static Web Apps — there is no per-route 401 target, so there is no configuration-only way to make that redirect locale-aware. The destination is lost too: SWA does not pass the original URL to the redirect target, so even a correct-locale bounce lands the visitor on a sign-in page that then sends them to the locale home rather than where they were going.

So the fix is to stop routing signed-out owners through the platform's 401 at all, and let the app do it — which is locale-correct by construction and preserves the destination via `signInPath(currentPath())`. That means ungating the three child routes as well as `/host`.

This is safe for the same reason `/host` is: authorization is enforced in the C# functions reading `x-ms-client-principal`, never by route rules — CLAUDE.md states this as a rule and the API already returns 401 to a stranger. The SWA gate was defence in depth on an HTML shell that contains no data.

**If this is rejected**, the fallback is to keep the three child gates and accept that a signed-out deep link to `/en/host/new` lands on the Spanish sign-in page. `/host` itself must still be ungated for the plan's goal. Say so at Checkpoint C and Steps 2–5 below are skipped.

- [ ] **Step 1: Rewrite the gated routes**

In `app/public/staticwebapp.config.json`, replace the four `host` entries in `routes`:

```json
    {
      "route": "/es/host/*",
      "allowedRoles": ["authenticated"]
    },
    {
      "route": "/en/host/*",
      "allowedRoles": ["authenticated"]
    },
```

with nothing. Delete both. `/es/account/*`, `/en/account/*`, `/es/admin/*` and `/en/admin/*` stay exactly as they are — those routes do not exist yet, and when they do they can make their own decision.

Leave `responseOverrides.401` pointing at `/es/sign-in/`. It is now unreachable for owner routes and remains a backstop for `/account/*` and `/admin/*`.

- [ ] **Step 2: Write the redirect guard**

Create `app/components/host/RequireOwner.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/site/AuthProvider";
import { currentPath, signInPath } from "@/lib/auth";

// The owner's working routes — new, edit, manage — are useless without a
// session, so a signed-out visitor is sent to sign in and brought back.
//
// This is in the app rather than in staticwebapp.config.json on purpose. The
// platform's allowedRoles produces a 401, and responseOverrides.401 is a
// SINGLE GLOBAL TARGET: it sent every English visitor to /es/sign-in/ and
// dropped the destination on the floor. Here the locale is whatever the
// visitor is already reading and the destination round-trips.
//
// It is NOT the authorization boundary. That is the C# functions, which read
// x-ms-client-principal and 401 a stranger regardless of what this renders.
export function RequireOwner({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me.authenticated) router.replace(signInPath(currentPath()));
  }, [loading, me.authenticated, router]);

  if (loading || !me.authenticated) {
    return (
      <main className="mx-auto max-w-7xl px-6 pt-6">
        <div className="skeleton h-40 rounded-(--radius-card)" />
      </main>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: Wrap the three routes**

In each of `app/app/[locale]/host/new/page.tsx`, `app/app/[locale]/host/edit/page.tsx` and `app/app/[locale]/host/manage/page.tsx`, import the guard:

```tsx
import { RequireOwner } from "@/components/host/RequireOwner";
```

and wrap the component's returned JSX in `<RequireOwner>…</RequireOwner>`. If a file's default export is the page component, the smallest change is to rename it and add a wrapper:

```tsx
export default function HostNewPage() {
  return (
    <RequireOwner>
      <HostNewPageInner />
    </RequireOwner>
  );
}
```

renaming the existing `export default function` to `function HostNewPageInner()`. Do the same in each of the three files, with the name matching the file.

- [ ] **Step 4: Restart the emulator and re-measure**

`staticwebapp.config.json` is read at startup, so stop and restart `swa start`. Then, signed out:

```bash
for p in /es/host/ /en/host/ /es/host/new/ /en/host/new/; do
  printf "%-16s -> " "$p"
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" --max-time 5 "http://localhost:4280$p"
done
```

Expected: all four `200` with an empty redirect_url. The child routes now bounce in the browser, not at the edge.

- [ ] **Step 5: Confirm the in-app bounce is locale-correct**

Signed out in a browser, visit `http://localhost:4280/en/host/new/`. Expected: it lands on `/en/sign-in?redirect=%2Fen%2Fhost%2Fnew` — **English**, with the destination carried. Repeat for `/es/`.

- [ ] **Step 6: Build and commit**

```bash
cd app && npm run build && npm test
git add app/public/staticwebapp.config.json app/components/host/RequireOwner.tsx "app/app/[locale]/host/new/page.tsx" "app/app/[locale]/host/edit/page.tsx" "app/app/[locale]/host/manage/page.tsx"
git commit -m "fix(auth): the owner routes send you to sign in in your own language"
```

---

## ⛳ Checkpoint C — routing and the judgement call

Show: the before/after `curl` table, the `/en/host/new/` bounce landing on `/en/sign-in`, and the rationale above. Ask explicitly whether ungating the three child routes is accepted. **Wait for a verdict before Task 7.**

---

## Task 7: Lock it down with e2e

The suite opens every route in both locales and fails on an uncaught exception or a console error. `/host` now has two faces, so it needs two cases — and the `anonMe` mechanism for the second already exists (`e2e/pages.spec.ts:137`).

**Files:**
- Modify: `app/e2e/pages.spec.ts`

- [ ] **Step 1: Add the signed-out case**

In `ROUTES`, directly after the existing `{ path: "/host", … }` entry, add:

```ts
  // The same route signed out, which since 2026-08-01 is a different page:
  // the owner pitch, not the portfolio. Both faces are covered because the
  // bug that made this route public was that only one of them existed.
  {
    path: "/host",
    expect: { es: /Publica tu vivienda/i, en: /List your home/i },
    anonMe: true,
  },
```

- [ ] **Step 2: Make `anonMe` mean "signed out", not just "anonymous /api/me"**

`anonMe` currently stubs `/api/me` only. `/api/host/properties` would still answer 200 from the fixture, so the page would render the portfolio to a visitor the rest of the app believes is a stranger — the signed-out case would pass while asserting the wrong page. A signed-out visitor gets 401 from every owner endpoint, so say that.

In the `if (anonMe) { … }` block, after the existing `/api/me` route, add:

```ts
        // A signed-out visitor is signed out everywhere. Without this the
        // owner endpoint keeps answering 200 from the fixture and the page
        // under test is the portfolio, not the pitch.
        await page.route("**/api/host/properties", (route: Route) =>
          route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
        );
```

and widen the doc comment on the `anonMe?: true` field (line ~133) to say it simulates a signed-out visitor across `/api/me` *and* the owner endpoints, not just the `/sign-in` case it was written for.

- [ ] **Step 3: Label the two `/host` tests apart**

The route-enumeration guard dedupes by path (`new Set(ROUTES.map(...))`), so a second `/host` entry is fine. Playwright test names are the same for both, so append a label — change the `test(...)` title line from:

```ts
    test(`${url} renders without errors`, async ({ page }) => {
```

to:

```ts
    test(`${url}${anonMe ? " (signed out)" : ""} renders without errors`, async ({ page }) => {
```

- [ ] **Step 4: Run just the host cases**

Run: `cd app && npx playwright test --workers=1 -g "host renders"`
Expected: 4 passed — `/es/host`, `/en/host`, and both signed-out variants.

- [ ] **Step 5: Assert the pill highlights, in both states**

Append a test at the end of `app/e2e/pages.spec.ts`:

```ts
// The reported bug: signed out, the owner segment pointed at /about#hosts
// while its matcher only knew /host, so the pill went blank. It is one href
// now — asserted in both auth states, because the whole failure was that the
// two states disagreed.
for (const anon of [false, true]) {
  test(`the owner nav segment is highlighted on /host${anon ? " (signed out)" : ""}`, async ({
    page,
  }) => {
    await stubBackend(page);

    if (anon) {
      await page.route("**/api/me", (route: Route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            authenticated: false, userId: null, name: null, provider: null,
            roles: ["anonymous"], isAdmin: false, isDeactivated: false,
          }),
        }),
      );
      await page.route("**/api/host/properties", (route: Route) =>
        route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
      );
    }

    await page.goto("/en/host", { waitUntil: "networkidle" });

    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Manage Property" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Find a home" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });
}
```

- [ ] **Step 6: Run it**

Run: `cd app && npx playwright test --workers=1 -g "owner nav segment"`
Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add app/e2e/pages.spec.ts
git commit -m "test(e2e): /host has two faces now, and the pill lights up for both"
```

---

## Task 8: Full verification

**Files:** none.

- [ ] **Step 1: Unit tests**

Run: `cd app && npm test`
Expected: 11 + 1 files, 209 + 6 tests, all passing.

- [ ] **Step 2: Build**

Run: `cd app && npm run build`
Expected: green, and the route list includes `/es/host` and `/en/host`.

- [ ] **Step 3: Lint**

Run: `cd app && npm run lint`
Expected: exactly the 4 pre-existing errors in `app/[locale]/page.tsx`, `app/[locale]/property/page.tsx` and `app/not-found.tsx`. Anything else is yours.

- [ ] **Step 4: Full e2e, serially**

Run: `cd app && npx playwright test --workers=1`
Expected: all passing. Run serially — in parallel this suite is flaky against the dev server for reasons unrelated to this work (measured 2026-08-01: 30 failed / 3 passed on a clean tree).

- [ ] **Step 5: API tests, since the SWA config changed**

Run: `~/.dotnet/dotnet test api/Ebrostay.Api.Tests`
Expected: green. Nothing here should touch them; this confirms it.

- [ ] **Step 6: Manual pass on the emulator**

With `swa start` running, signed out and then signed in, in both locales:
- `/host` — pitch, then portfolio.
- The nav pill highlighted in both.
- `/host/new` signed out — bounces to `/xx/sign-in` in the right language.
- `/about` — unchanged, `#hosts` section still present, still linked. (Decision 3.)

---

## ⛳ Checkpoint D — done

Show every command's output from Task 8. Then decide together whether this lands as one squashed commit on `redesign/v2` or stays as the per-task series.

---

## Out of scope, on purpose

- The `/about` → `/account` 404. Backlogged in Task 1 (Decision 5).
- Moving anything out of `/about`. It keeps its section and its link (Decision 3).
- Metadata for `/host`. It is a client component and cannot export `generateMetadata`; its `<title>` is the layout's "Ebrostay". Now that the route is public and indexable this is worth a `host/layout.tsx` — but it is a separate change and not required for anything here.
- The `--filter-h` and theme-flicker work already on this branch, which is unrelated and already committed to the working tree.
