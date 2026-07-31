# Identity Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SWA's shared preconfigured sign-in with an Ebrostay-owned identity — email + password and Google, behind our own branding — on a Standard-plan static web app in West Europe.

**Architecture:** A new Microsoft Entra External ID *external tenant* becomes the single OIDC provider that Static Web Apps sees. It brokers local email+password accounts and Google federation internally, so one person is one Entra user object and therefore one stable SWA `userId`, however they choose to sign in. SWA is recreated on the Standard plan (custom auth requires it) in West Europe, replacing the East US 2 app and closing the transatlantic hop to Cosmos in Spain Central.

**Tech Stack:** Azure Static Web Apps (Standard), Microsoft Entra External ID, Next.js App Router with `output: "export"`, TypeScript, next-intl, vitest, Playwright, Azure CLI.

**Design spec:** `docs/superpowers/specs/2026-07-31-identity-migration-design.md`

## Global Constraints

- **Bilingual ES/EN is a hard requirement.** Every user-facing string exists in `app/messages/es.json` **and** `app/messages/en.json`. Spanish is default.
- **Import `Link`/`useRouter` from `@/i18n/navigation`**, never from `next/link` / `next/navigation`.
- **Static export only.** No middleware, no route handlers, no dynamic SSR. `app/public/staticwebapp.config.json` carries routing and auth.
- **Light and dark mode are both first-class.** Theme is `data-theme` on `<html>`; never use `@media (prefers-color-scheme)` directly.
- **Authorization is enforced in the C# functions** by parsing `x-ms-client-principal`. Route rules are cosmetic (spec-v2 §3.5).
- **Secrets never in the client or repo.** Entra client ID and secret live in SWA application settings only.
- `cd app && npm run build` must stay green.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Cost Gates

Two steps spend money or destroy resources. Both are pre-approved by the user as recorded here; anything **beyond** these requires asking first.

| Step | Cost / effect | Status |
| --- | --- | --- |
| Task 2 — create SWA Standard | ~$9 USD/month | **Approved** |
| Task 2 — delete `ebrostay-v2` after the West Europe app serves the site | destructive, verified non-production | **Approved** |
| Task 11 — Apple sign-in | **$99 USD/year** Apple Developer Program, plus a **manual client-secret renewal every 6 months** | **NOT approved — optional, ask first** |

---

## Task 1: Create the Entra external tenant, Google federation, and branded user flow

**This task cannot be automated.** External tenants are created only in the Microsoft Entra admin center (the Azure portal creates workforce tenants only), Google federation requires a Google Cloud project owned by a human, and two fields are **immutable after creation**.

**Files:** none — this task produces configuration values consumed by Task 3.

**Interfaces:**
- Produces: `TENANT_NAME` (the subdomain, e.g. `ebrostayid`), `TENANT_ID` (a GUID), `OIDC_CLIENT_ID` (app registration Application ID), `OIDC_CLIENT_SECRET` (a secret string). Task 3 consumes all four.

- [ ] **Step 1: Create the external tenant**

**Prerequisite:** the **Tenant Creator** role, scoped to the subscription or a
resource group within it. Grant it in the Azure portal under **Subscriptions →
Access control (IAM)** if needed.

Go to <https://entra.microsoft.com> — the **Entra admin center**, not the Azure
portal, which can only create *workforce* tenants. Then **Entra ID** →
**Overview** → **Manage tenants** → **Create** → **External** → **Continue**.

A **30-day free trial** requiring no subscription is offered first. **Decline
it** — it is a throwaway that would have to be recreated and rewired. Choose
**Use Azure Subscription**.

*Basics* tab:

| Field | Value | Changeable later? |
| --- | --- | --- |
| Tenant Name | `Ebrostay` | Yes — display name only |
| Domain Name | `ebrostayid` | **No — permanent** |
| Country/Region | **Spain** | **No — permanent** |

Domain Name yields `ebrostayid.onmicrosoft.com` and the sign-in host
`ebrostayid.ciamlogin.com`, which appears in the visitor's address bar. Every
config value and privacy paragraph in this plan assumes `ebrostayid`; a
different choice means editing Task 3 and Task 8 to match.

Country/Region is what makes the EU data-residency statement in the privacy
policy true.

*Add a subscription* tab:
- Subscription: **`2cda7364-dba2-4b44-aff0-f5a6fcfac010`** — match on the **ID**,
  not the name. Two directories in this account both display as "Azure
  subscription 1".
- Resource group: **`ebrostay`** (existing, alongside Cosmos and storage).

**Review + Create.** Provisioning takes **up to 30 minutes**; watch the
Notifications pane.

- [ ] **Step 2: Find the tenant ID and record it where it will not be confused**

Switch into the new tenant: **Settings icon** (top right) → **Directories +
subscriptions** → find it in the **Directory name** list → **Switch**. Then
**Tenant overview** shows **Name**, **Tenant ID** and **Primary domain**.

Two directories in this account already display as "Azure subscription 1". Write down, in the team password manager:

```
Entra external tenant name: ebrostayid
Entra external tenant ID:   <GUID from Tenant overview>
Azure subscription ID:      2cda7364-dba2-4b44-aff0-f5a6fcfac010
```

- [ ] **Step 3: Register the application**

In the external tenant: **Entra ID** → **App registrations** → **New registration**.

- Name: `Ebrostay web`
- Supported account types: accounts in this organizational directory only
- Redirect URI: **Web** → `https://<SWA_HOSTNAME>/.auth/login/ebrostay/callback`

`<SWA_HOSTNAME>` comes from Task 2. If Task 2 has not run yet, register the URI afterwards — the app registration can be edited freely.

Record the **Application (client) ID** as `OIDC_CLIENT_ID`.

- [ ] **Step 4: Create a client secret**

**Certificates & secrets** → **New client secret**. Set the longest available expiry and put a calendar reminder two weeks before it. Copy the **Value** (not the Secret ID) immediately — it is shown once. This is `OIDC_CLIENT_SECRET`.

- [ ] **Step 5: Create the sign-up and sign-in user flow**

**Entra ID** → **External Identities** → **User flows** → **New user flow**.

- Identity providers: **Email with password** (this is the default local-account option)
- User attributes to collect: **Display Name** and **Email Address** — nothing more. Every extra attribute is a field a guest must fill before they can book.
- Associate the `Ebrostay web` application with the flow.

Do **not** choose "Email one-time passcode". The decision (spec D3) is password, and switching later affects only *new* users — existing accounts keep the method they registered with.

- [ ] **Step 6: Add Google as an identity provider**

First, in <https://console.cloud.google.com>: create a project, then **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID** → **Web application**. Set the authorised redirect URI to:

```
https://ebrostayid.ciamlogin.com/ebrostayid.onmicrosoft.com/federation/oauth2
```

Copy the Google **Client ID** and **Client secret**.

Then in the Entra admin center: **External Identities** → **All identity providers** → **Google** → paste both values → **Save**. Then **User flows** → your flow → **Identity providers** → tick **Google** → **Save**.

- [ ] **Step 7: Apply company branding**

**Entra ID** → **Company Branding** → **Customize**. Set the Ebrostay logo, background, and brand colours so the page reads as Ebrostay rather than as a default Microsoft form.

This is the whole point of the migration — a guest about to hand over identity documents should not be looking at an unbranded Microsoft page.

- [ ] **Step 8: Verify the flow standalone before wiring anything**

Use **Run user flow** in the portal. Confirm, in the branded page:
- Signing **up** with an email address works, and the address is verified by an emailed code.
- Signing **in** with that account works.
- **Forgot password** sends a code and allows setting a new one.
- **Continue with Google** completes and lands back.

If any of these fail, stop here. Nothing downstream can work, and every later task is cheaper to fix than to debug through two redirects.

---

## Task 2: Create the West Europe Standard app and retire East US 2 ✅ DONE 2026-07-31

**Outcome:** `ebrostay-home`, **West Europe**, **Standard**, host
`delightful-sand-063f8a703.7.azurestaticapps.net`. `ebrostay-v2` (East US 2)
deleted. Measured `/api/properties`: median **545 ms → 322 ms**, floor
**358 ms → 271 ms**.

**Two corrections found by executing this task — they were plan defects:**

1. **West Europe now accepts even a Free app.** The Step 1 probe succeeded, so
   ADR-021's eligibility refusal is simply gone. The Standard hypothesis was
   never needed and the East US 2 fallback never came into play. Record this in
   Task 10 Step 2 as the ADR-021 outcome.
2. **A new SWA has no application settings, and nothing in the original plan
   copied them.** `/api/health` passed while every Cosmos-backed route returned
   500. One of the nine settings, `IMPORT_CALLBACK_BASE_URL`, also embeds the
   app's own hostname and would have silently pointed import callbacks at the
   deleted app. This is now Step 4 below. **Do not delete the source app before
   this step has run and verified** — it is the only copy of those values.
3. **`/api/homes` does not exist.** The routes are `/api/health`,
   `/api/properties`, `/api/me`. Step 6 originally checked a v1 route name.

**Files:**
- Modify: `.github/workflows/swa-v2.yml` (no content change; the repository secret it reads is repointed)

**Interfaces:**
- Produces: `SWA_HOSTNAME` = `delightful-sand-063f8a703.7.azurestaticapps.net`, consumed by Task 1 Step 3 and Task 3.

- [x] **Step 1: Confirm the region is still refused on Free before paying for Standard**

```bash
az staticwebapp create -n swa-euw-probe -g ebrostay -l westeurope --sku Free
az staticwebapp delete -n swa-euw-probe -g ebrostay --yes
```

**Result: succeeded.** West Europe is no longer location-ineligible. Standard is
still required — but for custom auth, not for the region.

- [x] **Step 2: Create the Standard app in West Europe**

**Cost gate: ~$9 USD/month. Approved.**

```bash
az staticwebapp create -n ebrostay-home -g ebrostay -l westeurope --sku Standard
```

- [x] **Step 3: Capture the hostname and deployment token**

```bash
az staticwebapp show -n ebrostay-home -g ebrostay --query defaultHostname -o tsv
az staticwebapp secrets list -n ebrostay-home -g ebrostay --query "properties.apiKey" -o tsv
```

- [x] **Step 4: Copy the application settings from the old app**

A new static web app starts with **no** application settings. The functions
will start and `/api/health` will pass, because it touches nothing — but every
Cosmos-backed route returns 500 until this runs.

Settings whose value contains the **old** hostname must be rewritten, or they
will point at an app that is about to be deleted. `IMPORT_CALLBACK_BASE_URL` is
one such setting.

```bash
python3 - <<'EOF'
import json, subprocess
OLD_HOST = "gentle-plant-000592f0f.7.azurestaticapps.net"
NEW_HOST = "delightful-sand-063f8a703.7.azurestaticapps.net"
raw = subprocess.run(["az","staticwebapp","appsettings","list","-n","ebrostay-v2",
                      "-g","ebrostay","-o","json"], capture_output=True, text=True,
                     check=True).stdout
props = json.loads(raw); props = props.get("properties", props)
pairs = []
for k, v in sorted(props.items()):
    v = "" if v is None else str(v)
    if not v:
        print(f"  {k}: EMPTY on source - skipped"); continue
    if OLD_HOST in v:
        v = v.replace(OLD_HOST, NEW_HOST); print(f"  {k}: rewritten to the new host")
    else:
        print(f"  {k}: copied verbatim")
    pairs.append(f"{k}={v}")
subprocess.run(["az","staticwebapp","appsettings","set","-n","ebrostay-home",
                "-g","ebrostay","--setting-names",*pairs,"-o","none"], check=True)
EOF
```

Values are never printed — only names and whether a rewrite happened.

- [x] **Step 5: Repoint the deployment secret**

`.github/workflows/swa-v2.yml:56` reads `secrets.AZURE_STATIC_WEB_APPS_API_TOKEN_V2`. Update that repository secret rather than renaming it, so the workflow file needs no edit:

```bash
printf '%s' "<token from step 3>" | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN_V2 --repo ebrostay/home
```

- [x] **Step 6: Deploy the current code unchanged**

```bash
git push origin redesign/v2
gh run watch --repo ebrostay/home --exit-status
```

The code at this point still uses the preconfigured providers, which is correct:
a Standard app with no `auth` block behaves exactly like the Free app did. This
proves hosting, the API and the build pipeline work in the new region **before**
auth is layered on.

- [x] **Step 7: Verify the new app serves the site and reaches Cosmos**

```bash
H=delightful-sand-063f8a703.7.azurestaticapps.net
curl -sS -o /dev/null -w '%{http_code}\n' "https://$H/es/"          # expect 200
curl -sS -o /dev/null -w '%{http_code}\n' "https://$H/api/health"    # expect 200
curl -sS "https://$H/api/properties" | head -c 200                    # expect JSON, not an error
curl -sS "https://$H/api/me"                                          # expect the anonymous shape
```

`/api/properties` is the one that matters: it proves the West Europe functions
can reach Cosmos in Spain Central. A 503 on the first call right after Step 4 is
the function host restarting — retry.

- [x] **Step 8: Delete the East US 2 app**

**Destructive. Approved, conditional on Step 7 passing.** Do not run if Step 7
failed, and never before Step 4 has succeeded — the old app holds the only copy
of the application settings.

```bash
az staticwebapp delete -n ebrostay-v2 -g ebrostay --yes
az staticwebapp list --query "[].{name:name,location:location,sku:sku.name}" -o table
curl -sSI https://ebrostay.com | grep -i '^server:'   # expect GitHub.com — production untouched
```

- [x] **Step 9: Retire the workflow and credential left on `main`**

`main` carried `azure-static-web-apps-thankful-sea-0e236161e.yml`, targeting the
West US 2 app deleted on 2026-07-31, plus its now-dead deployment secret. Leave
`pages.yml` alone — it publishes production v1 to GitHub Pages.

Done as PR #61. The secret `AZURE_STATIC_WEB_APPS_API_TOKEN_THANKFUL_SEA_0E236161E`
was deleted — a live deployment credential for a deleted resource is pure
liability.

---

## Task 3: Wire Entra as the SWA identity provider and prove a real sign-in

**Files:**
- Modify: `app/public/staticwebapp.config.json`

**Interfaces:**
- Consumes: `TENANT_NAME`, `TENANT_ID`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (Task 1), `SWA_HOSTNAME` (Task 2)
- Produces: a working `/.auth/login/ebrostay` route, consumed by Tasks 4, 5 and 7

- [ ] **Step 1: Store the secrets as application settings**

Never in the repo.

```bash
az staticwebapp appsettings set -n ebrostay-home -g ebrostay --setting-names \
  EBROSTAY_OIDC_CLIENT_ID="<OIDC_CLIENT_ID>" \
  EBROSTAY_OIDC_CLIENT_SECRET="<OIDC_CLIENT_SECRET>"
```

- [ ] **Step 2: Add the auth block and the 401 override**

Replace the whole of `app/public/staticwebapp.config.json` with:

```json
{
  "trailingSlash": "auto",
  "auth": {
    "identityProviders": {
      "customOpenIdConnectProviders": {
        "ebrostay": {
          "registration": {
            "clientIdSettingName": "EBROSTAY_OIDC_CLIENT_ID",
            "clientCredential": {
              "clientSecretSettingName": "EBROSTAY_OIDC_CLIENT_SECRET"
            },
            "openIdConnectConfiguration": {
              "wellKnownOpenIdConfiguration": "https://ebrostayid.ciamlogin.com/<TENANT_ID>/v2.0/.well-known/openid-configuration"
            }
          },
          "login": {
            "nameClaimType": "name",
            "scopes": ["openid", "profile", "email"],
            "loginParameterNames": []
          }
        }
      }
    }
  },
  "routes": [
    { "route": "/", "redirect": "/es/", "statusCode": 302 },
    { "route": "/es/account/*", "allowedRoles": ["authenticated"] },
    { "route": "/en/account/*", "allowedRoles": ["authenticated"] },
    { "route": "/es/host/*", "allowedRoles": ["authenticated"] },
    { "route": "/en/host/*", "allowedRoles": ["authenticated"] },
    { "route": "/es/admin/*", "allowedRoles": ["admin"] },
    { "route": "/en/admin/*", "allowedRoles": ["admin"] }
  ],
  "responseOverrides": {
    "401": { "statusCode": 302, "redirect": "/.auth/login/ebrostay" },
    "404": { "rewrite": "/404.html" }
  },
  "platform": {
    "apiRuntime": "dotnet-isolated:9.0"
  }
}
```

Substitute the real `<TENANT_ID>`. The 401 override is the second half of the sign-out fix: without it an anonymous visitor to `/es/host/manage` gets a bare platform error instead of a login prompt.

- [ ] **Step 3: Deploy**

```bash
git add app/public/staticwebapp.config.json
git commit -m "feat(auth): sign-in goes through our own tenant, not the platform's

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
gh run watch --repo ebrostay/home
```

- [ ] **Step 4: Prove a real sign-in, and check the two things most likely to be wrong**

In a browser, visit `https://<SWA_HOSTNAME>/.auth/login/ebrostay`. Complete a sign-in. Then visit `https://<SWA_HOSTNAME>/.auth/me` and read the JSON.

Check all four:

1. `clientPrincipal` is non-null and `identityProvider` is `"ebrostay"`.
2. **`userDetails` is not empty.** If it is, `nameClaimType` is wrong — the account menu renders the first letter of this string, so an empty value means a blank avatar. Try `"http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"` instead of `"name"`, redeploy, and re-check.
3. `userId` is a stable GUID-like string.
4. **Sign out, then sign in again.** Visit `/.auth/logout`, then `/.auth/login/ebrostay`. If you are signed straight back in with no prompt, the Entra session survived SWA's logout — a real privacy problem on a shared computer. Record it; the fix is to chain sign-out through the tenant's `end_session_endpoint`, which is a change to Task 5's `logoutUrl` rather than to this config.

**Fallback if the custom OIDC provider is rejected outright:** swap the `customOpenIdConnectProviders` block for an `azureActiveDirectory` block with `"openIdIssuer": "https://ebrostayid.ciamlogin.com/<TENANT_ID>/v2.0"` and `clientIdSettingName` / `clientSecretSettingName`. The login path then becomes `/.auth/login/aad`, and every `ebrostay` literal in Tasks 3–7 becomes `aad`.

- [ ] **Step 5: Verify the 401 override**

In a private window (signed out), visit `https://<SWA_HOSTNAME>/es/host/manage`. Expected: redirected to the branded sign-in page, not an error page.

---

## Task 4: Collapse the auth helpers to a single provider

**Files:**
- Modify: `app/lib/auth.ts`
- Test: `app/lib/auth.test.ts` (create)

**Interfaces:**
- Consumes: the `/.auth/login/ebrostay` route (Task 3)
- Produces: `PROVIDER: string`, `loginUrl(redirectTo: string): string`, `logoutUrl(redirectTo: string): string`, `localeHome(locale: string): string`, `currentPath(): string`, `fetchMe(): Promise<Me>`, `type Me`, `ANON: Me`. Task 5 consumes `loginUrl`, `logoutUrl`, `currentPath`, `localeHome`.

The `Provider` type and `loginUrl`'s provider argument are removed. `Me.provider` stays — it is returned by `/api/me` and is now always `"ebrostay"`.

- [ ] **Step 1: Write the failing tests**

Create `app/lib/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loginUrl, logoutUrl, localeHome, PROVIDER } from "./auth";

describe("loginUrl", () => {
  it("targets the single Ebrostay provider", () => {
    expect(loginUrl("/es/")).toContain(`/.auth/login/${PROVIDER}`);
  });

  it("encodes the return path so query strings survive the round trip", () => {
    expect(loginUrl("/es/property?id=abc&x=1")).toBe(
      "/.auth/login/ebrostay?post_login_redirect_uri=%2Fes%2Fproperty%3Fid%3Dabc%26x%3D1",
    );
  });
});

describe("logoutUrl", () => {
  it("encodes the return path", () => {
    expect(logoutUrl("/en/")).toBe(
      "/.auth/logout?post_logout_redirect_uri=%2Fen%2F",
    );
  });
});

describe("localeHome", () => {
  // Sign-out must land somewhere public: the browser is anonymous by the time
  // it arrives, and every /host, /account and /admin route is behind
  // allowedRoles, which answers 403 rather than redirecting.
  it("returns a locale-prefixed root for each supported locale", () => {
    expect(localeHome("es")).toBe("/es/");
    expect(localeHome("en")).toBe("/en/");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd app && npx vitest run lib/auth.test.ts
```

Expected: FAIL — `localeHome` and `PROVIDER` are not exported, and `loginUrl` currently takes two arguments.

- [ ] **Step 3: Rewrite the helpers**

In `app/lib/auth.ts`, replace everything from `export type Provider` to the end of the file with:

```ts
// One provider: the Entra External ID tenant brokers email+password and Google
// behind a single branded page, so there is nothing for the app to choose. The
// name matches the key in staticwebapp.config.json's customOpenIdConnectProviders.
export const PROVIDER = "ebrostay";

export function loginUrl(redirectTo: string): string {
  return `/.auth/login/${PROVIDER}?post_login_redirect_uri=${encodeURIComponent(redirectTo)}`;
}

export function logoutUrl(redirectTo: string): string {
  return `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(redirectTo)}`;
}

// Current locale-prefixed path, for round-tripping the user back after login.
export function currentPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

// Where sign-out lands. It must be public: by the time the redirect is
// followed the browser holds no session, and every gated route answers 403
// rather than bouncing to login. Returning to currentPath() was the bug.
export function localeHome(locale: string): string {
  return `/${locale}/`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd app && npx vitest run lib/auth.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add app/lib/auth.ts app/lib/auth.test.ts
git commit -m "refactor(auth): one provider means nothing left to choose

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Replace the provider picker with a single sign-in button, and fix sign-out

**Files:**
- Modify: `app/components/site/AuthMenu.tsx`

**Interfaces:**
- Consumes: `loginUrl`, `logoutUrl`, `currentPath`, `localeHome` (Task 4); `useAuth()` from `./AuthProvider`

- [ ] **Step 1: Rewrite the component**

Replace the whole of `app/components/site/AuthMenu.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "./AuthProvider";
import { loginUrl, logoutUrl, currentPath, localeHome } from "@/lib/auth";

export function AuthMenu() {
  const t = useTranslations("auth");
  const tn = useTranslations("nav");
  const locale = useLocale();
  const { me, loading } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) {
    return <div className="skeleton h-9 w-9 shrink-0 rounded-(--radius-control)" />;
  }

  const go = (href: string) => {
    window.location.href = href;
  };

  // Signed out there is nothing to pick: the choice between an Ebrostay
  // account and Google now lives on our own branded page, so the dropdown
  // that used to offer GitHub and Microsoft is gone with them.
  if (!me.authenticated) {
    return (
      <button
        type="button"
        onClick={() => go(loginUrl(currentPath()))}
        className="h-9 shrink-0 rounded-(--radius-control) bg-brand px-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
      >
        {tn("signIn")}
      </button>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-(--radius-control) border border-line text-ink transition-colors hover:border-line-strong"
      >
        {/* The initial, never the name. The name cost up to 120px of the bar
            and was the one thing in it that the person reading it already
            knew — so it moved into the menu, where it answers a question
            someone might actually have (which account is this?) instead of
            occupying the width the nav needs. */}
        <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-soft text-[0.625rem] font-bold text-brand-strong">
          {(me.name ?? "?").slice(0, 1).toUpperCase()}
        </span>
      </button>

      {open && (
        <>
          <button
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-(--radius-card) border border-line bg-surface p-1 shadow-(--shadow-pop)"
          >
            <p className="truncate border-b border-line px-2.5 pb-2 pt-1.5 text-sm font-semibold text-ink">
              {me.name}
            </p>
            {me.isDeactivated && (
              <p className="m-1 rounded-(--radius-control) bg-danger-soft px-2.5 py-2 text-xs text-danger">
                {t("deactivated")}
              </p>
            )}
            <MenuLink href="/account" onClick={() => setOpen(false)}>
              {t("account")}
            </MenuLink>
            {me.isAdmin && (
              <MenuLink href="/admin" onClick={() => setOpen(false)}>
                {t("adminPanel")}
              </MenuLink>
            )}
            {/* Sign-out lands on the locale home, never the current page:
                the browser is anonymous by the time it gets there, and every
                gated route answers 403 instead of bouncing to login. */}
            <button
              role="menuitem"
              onClick={() => go(logoutUrl(localeHome(locale)))}
              className="block w-full rounded-(--radius-control) px-2.5 py-2 text-left text-sm text-body transition-colors hover:bg-surface-2 hover:text-ink"
            >
              {t("signOut")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      role="menuitem"
      href={href}
      onClick={onClick}
      className="block rounded-(--radius-control) px-2.5 py-2 text-sm text-body transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </Link>
  );
}
```

The `ProviderButton` component and both inline SVGs (the GitHub mark and the Microsoft squares) are deleted with this rewrite.

- [ ] **Step 2: Verify it compiles and the suite still passes**

```bash
cd app && npm run build && npm test
```

Expected: build succeeds, tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/components/site/AuthMenu.tsx
git commit -m "fix(auth): signing out no longer lands on a 403

The menu sent post_logout_redirect_uri back to the page you left, which for
/account, /host and /admin is behind allowedRoles — so the now-anonymous
browser was bounced by the very rule it had just satisfied. Sign-out goes to
the locale home instead.

The signed-out dropdown goes too: with one provider there is nothing to pick.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Retire the dead provider strings

**Files:**
- Modify: `app/messages/es.json`
- Modify: `app/messages/en.json`

- [ ] **Step 1: Delete three keys from each locale**

Remove `signInWith`, `github` and `microsoft` from the `auth` object in **both** files. Keep `account`, `adminPanel`, `signOut`, `deactivated`, and `nav.signIn`.

After the edit, `auth` in `app/messages/en.json` reads:

```json
"auth": {
  "account": "My account",
  "adminPanel": "Admin panel",
  "signOut": "Sign out",
  "deactivated": "Your account is deactivated. Contact us to reactivate it."
}
```

and in `app/messages/es.json`:

```json
"auth": {
  "account": "Mi cuenta",
  "adminPanel": "Administración",
  "signOut": "Salir",
  "deactivated": "Tu cuenta está desactivada. Escríbenos para reactivarla."
}
```

- [ ] **Step 2: Confirm nothing still references them**

```bash
cd app && grep -rn "signInWith\|auth.github\|auth.microsoft" app components lib
```

Expected: no matches.

- [ ] **Step 3: Build and commit**

```bash
cd app && npm run build
git add app/messages/es.json app/messages/en.json
git commit -m "chore(i18n): drop the strings for providers we no longer offer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Update the end-to-end fixture

**Files:**
- Modify: `app/e2e/fixtures/me.json`

- [ ] **Step 1: Change the provider value**

`app/e2e/fixtures/me.json` currently claims `"provider": "github"`. Set it to `"ebrostay"`:

```json
{
  "authenticated": true,
  "userId": "e2e00000000000000000000000000001",
  "name": "E2E Owner",
  "provider": "ebrostay",
  "roles": ["anonymous", "authenticated"],
  "isAdmin": false,
  "isDeactivated": false
}
```

- [ ] **Step 2: Run the suite**

```bash
cd app && npm run build && npm run test:e2e
```

Expected: PASS. The suite opens every page in `es` and `en` and fails on any console error, so this also catches a missing translation key from Task 6.

- [ ] **Step 3: Commit**

```bash
git add app/e2e/fixtures/me.json
git commit -m "test(e2e): the fixture principal comes from our tenant now

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Update the privacy policy

**Files:**
- Modify: `app/app/[locale]/privacy/content.ts`

The page component needs no change — it renders whatever `privacyContent` holds. Four paragraphs and the file header comment are now false.

- [ ] **Step 1: Fix the file header comment**

`app/app/[locale]/privacy/content.ts` opens by describing the v2 stack. The clause `sign-in via GitHub/Microsoft accounts instead of email+password` is now backwards. Replace that clause with:

```
// sign-in via an Ebrostay account (email + password) or Google, brokered by
// Microsoft Entra External ID in an EU-located external tenant;
```

- [ ] **Step 2: Rewrite the four Spanish paragraphs**

In the `es` block:

*Section "Qué datos tratamos y para qué"*, the account paragraph (currently begins `inicias sesión con tu cuenta de GitHub o de Microsoft`):

```
text: "creas una cuenta de Ebrostay con tu correo y una contraseña, o entras con tu cuenta de Google. La identidad la gestiona Microsoft Entra External ID por nuestra cuenta, en un directorio alojado en la Unión Europea; nosotros nunca vemos ni almacenamos tu contraseña. Conservamos tu identificador de usuario, el método de acceso y tu nombre para vincular tus solicitudes, estancias y anuncios.",
```

*Section "Cookies y almacenamiento local"*:

```
text: "No usamos cookies de seguimiento ni publicidad, por eso no verás un banner de consentimiento. Al iniciar sesión, la plataforma establece una cookie técnica imprescindible para mantener tu sesión: es estrictamente necesaria para un servicio que has solicitado tú, y por eso no requiere consentimiento (art. 22.2 LSSI-CE). Tu navegador guarda localmente el idioma, el tema y los lugares que hayas añadido a «Tus lugares».",
```

*Section "Conservación y destinatarios"*:

```
text: "Conservamos los datos de reservas el tiempo exigido por las obligaciones fiscales y contractuales. La web funciona sobre Microsoft Azure (Static Web Apps, Cosmos DB y Blob Storage); la base de datos y las fotos se almacenan en la Unión Europea (región Spain Central, España). El registro y el inicio de sesión los presta Microsoft Entra External ID como encargado del tratamiento, en un directorio ubicado en la Unión Europea. Si eliges entrar con Google, compartes con Google los datos de esa autenticación.",
```

*Section "Tus derechos"*:

```
text: "Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición y portabilidad escribiendo a info@ebrostay.com. Si entraste con Google, también puedes revocar en cualquier momento el acceso concedido a Ebrostay desde tu cuenta de Google. Si lo consideras necesario, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).",
```

- [ ] **Step 3: Rewrite the matching English paragraphs**

In the `en` block:

*"What data we process and why"*, account paragraph:

```
text: "you create an Ebrostay account with your email address and a password, or sign in with your Google account. Identity is handled on our behalf by Microsoft Entra External ID, in a directory hosted in the European Union; we never see or store your password. We keep your user identifier, sign-in method and name to link your requests, stays and listings.",
```

*"Cookies and local storage"*:

```
text: "We use no tracking or advertising cookies, which is why you will not see a consent banner. When you sign in, the platform sets a technical cookie that is essential to keep your session: it is strictly necessary for a service you asked for, and so requires no consent (art. 22.2 LSSI-CE). Your browser locally stores your language, your theme and any places you added to \"Your places\".",
```

*"Retention and recipients"*:

```
text: "We keep booking data for as long as tax and contractual obligations require. The site runs on Microsoft Azure (Static Web Apps, Cosmos DB and Blob Storage); the database and photos are stored in the European Union (Spain Central region, Spain). Sign-up and sign-in are provided by Microsoft Entra External ID as a data processor, in a directory located in the European Union. If you choose to sign in with Google, you share that authentication data with Google.",
```

*"Your rights"*:

```
text: "You can exercise your rights of access, rectification, erasure, objection and portability by writing to info@ebrostay.com. If you signed in with Google, you can also revoke the access granted to Ebrostay from your Google account at any time. If you consider it necessary, you can lodge a complaint with the Spanish Data Protection Agency (aepd.es).",
```

- [ ] **Step 4: Bump the updated date in both locales**

Set `updated` to the month the change ships — `"Última actualización: agosto de 2026"` and `"Last updated: August 2026"` if it lands in August; keep July if it lands in July.

- [ ] **Step 5: Verify both locales render**

```bash
cd app && npm run build && npm run test:e2e
```

Then read both pages and confirm no GitHub or Microsoft-sign-in references survive:

```bash
grep -niE "github|cuenta de Microsoft|Microsoft account" "app/app/[locale]/privacy/content.ts"
```

Expected: no matches other than `Microsoft Entra External ID`, `Microsoft Azure`.

- [ ] **Step 6: Commit**

```bash
git add "app/app/[locale]/privacy/content.ts"
git commit -m "docs(privacy): Microsoft became a processor, so the notice says so

Entra External ID now handles registration, passwords and sign-in on our
behalf, in an EU directory. That is a disclosure obligation regardless of
what the account page ever becomes.

Also records why there is still no cookie banner: the session cookie was
always strictly necessary for a service the visitor asked for, and routing
Google through Entra keeps Google's SDK off our pages.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Re-seed the data and restore the admins

**Files:** none — this is data and portal work.

Every `userId` changed with the provider. `userId` keys `profiles.id`, `properties.hostId` and `bookingRequests.userId` (spec-v2 §3.4), so the existing seed rows point at principals that can never sign in again.

- [ ] **Step 1: Re-seed Cosmos**

```bash
cd infra && node seed.mjs
```

Confirmed with the user on 2026-07-31: only seed data exists — no real hosts, listings or booking requests. Nothing is being destroyed that anyone will miss.

- [ ] **Step 2: Re-invite the three admins**

Portal → Static Web App `ebrostay-home` → **Role management** → **Invite**. For each of the three admins:

- Authorization provider: the custom provider (`ebrostay`)
- Invitee: the email address they sign in with
- Role: `admin`
- Send the link promptly — invitations expire in hours.

Each invitee must open the link **while signed in with that account**, so the role binds to the right principal.

- [ ] **Step 3: Verify a role actually landed**

Signed in as an admin, visit `https://<SWA_HOSTNAME>/.auth/me` and confirm `userRoles` contains `"admin"`.

Then confirm the negative case still holds — a non-admin account must be refused by the **function**, not merely hidden by the route rule:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' "https://<SWA_HOSTNAME>/api/admin/review"
```

Expected: `401` when called without a session. A static page being reachable proves nothing; a function answering with data does (spec-v2 §3.5).

---

## Task 10: Amend the spec

**Files:**
- Modify: `docs/spec-v2/05-decision-log.md`
- Modify: `docs/spec-v2/03-auth-and-roles.md`
- Modify: `docs/spec-v2/01-architecture.md`
- Modify: `docs/spec-v2/07-legal-notes.md`

- [ ] **Step 1: Add ADR-027 superseding ADR-013**

Append to `docs/spec-v2/05-decision-log.md`, and add the row to the index table at the top:

```markdown
## ADR-027 — Entra External ID: an Ebrostay account, Google, and our own branding

- **Status:** ✅ locked 2026-07-31. **Supersedes ADR-013.**
- **Context:** ADR-013 chose SWA built-in auth on the Free tier with GitHub and
  Microsoft, accepting that users without either account could not book, and
  named the escape hatch: "SWA Standard tier + custom OIDC or Entra External
  ID". Two problems forced it: the consent screen asks users to trust
  "Azure Static Web Apps", a registration we do not own and cannot rename;
  and there is no email/password sign-up at all.
- **Decision:** A Microsoft Entra External ID **external tenant** becomes the
  single OIDC provider SWA sees, brokering **local email + password** accounts
  and **Google** federation behind Ebrostay-branded pages. SWA moves to the
  **Standard** plan (custom auth requires it). GitHub, Microsoft and Facebook
  are dropped as sign-in options.
- **Rationale:** Entra brokering keeps `userId` stable per person — registering
  Google directly against SWA would mint a second principal, and so a second
  `profiles` document and a disjoint set of listings, for the same human
  depending on which button they pressed. Email + password over one-time
  passcode because hosts carry the economic stake, sign in most often, and
  expect a conventional login. Password reset, email verification and lockout
  are all provided by the platform.
- **Consequences:**
  - ~$9/month for SWA Standard. Entra is $0 below 50,000 MAU.
  - **Microsoft sign-in is not reproducible.** External tenants federate one
    *nominated organisation*, not "any Microsoft account". Federating a
    specific corporate tenant remains available if a client asks.
  - Changing the local-account method later affects **only new users**.
  - Sign-in pages live at `ebrostayid.ciamlogin.com`. A custom login domain
    needs Azure Front Door at $35/month — deferred, additive.
  - **Apple deferred:** $99/year Apple Developer Program plus a manual
    client-secret renewal every 6 months.
  - The privacy policy changes: Microsoft becomes a processor for credentials.
```

- [ ] **Step 2: Amend ADR-021 and correct the region record**

In the ADR-021 entry, add:

```markdown
- **Amended 2026-07-31 (ADR-027):** West Europe was retried on the **Standard**
  plan. Outcome: <record "accepted, app recreated in westeurope" or "still
  refused, remains eastus2">.
- **Correction:** §1 recorded the v1 SWA `ebrostay-home` as being in
  *westeurope*. It was in **West US 2** (verified 2026-07-31 before deletion).
  The eligibility refusal was real; the artifact cited as evidence was not in
  that region.
```

- [ ] **Step 3: Rewrite §3.1 of `03-auth-and-roles.md`**

The current §3.1 states "exactly two providers: GitHub and Microsoft (`aad`)", "no email/password", and "v2 stays on Free". All three are now false. Replace the section body (from the `## 3.1` heading down to, but not including, `## 3.2`) with:

```markdown
## 3.1 SWA custom auth via Entra External ID ✅ (ADR-027, supersedes ADR-013)

v2 uses **SWA custom authentication** on the **Standard** plan, with exactly
one identity provider: a **Microsoft Entra External ID external tenant**
(`ebrostayid`, EU-located), registered under
`auth.identityProviders.customOpenIdConnectProviders.ebrostay`.

The tenant brokers three sign-in methods internally — **email + password**
(an Ebrostay-hosted local account), and **Google** federation. Because
federation happens inside Entra, one person is one Entra user object and so
one stable SWA `userId`, whichever method they use. Registering providers
directly against SWA would mint a separate principal per provider.

Sign-up email verification, password reset and lockout are provided by the
platform. **We store no credential.**

Endpoints (all served by the SWA platform, same origin):

| Endpoint | Purpose |
| --- | --- |
| `/.auth/login/ebrostay` | Sign-in; accepts `post_login_redirect_uri`. |
| `/.auth/me` | Client-side session check: returns `{ clientPrincipal }` (or `null`). No client-side token handling at all. |
| `/.auth/logout` | Sign out. `post_logout_redirect_uri` **must** target a public route — every gated route answers 403 to the anonymous browser that arrives. |
| `/.auth/purge/ebrostay` | User-initiated consent/data purge. |

A `401` response override redirects anonymous visitors on gated routes to
`/.auth/login/ebrostay` rather than showing a platform error page.

Not carried: **GitHub** and **Microsoft** (ADR-013's two providers) and
**Facebook**. External tenants federate one *nominated organisation*, not
"any Microsoft account", so the old Microsoft button has no equivalent;
email + password removes the reach argument that justified it. **Apple** is
supported by the tenant but deferred — $99/year plus a manual secret
rotation every 6 months (ADR-027).
```

- [ ] **Step 4: Update §3.3 and the §3.4 example**

In §3.3, the invitation provider changes. Replace `Invite by provider (GitHub or Microsoft) + the email/username the person signs in with` with:

```markdown
1. Invite by provider (`ebrostay`) + the email address the person signs in
   with; assign role `admin`; generate the invitation link (expires in hours
   — send it promptly).
```

Also replace `Free tier allows up to 25 custom-role users — ample.` with `Standard allows up to 25 custom-role users via invitation — ample for three.`

In the §3.4 JSON example, change `"identityProvider": "github"` to `"identityProvider": "ebrostay"` and `"userDetails": "janedoe"` to `"userDetails": "jane@example.com"` — the custom provider yields an email address, not a username.

- [ ] **Step 5: Update the §1 resource table**

In `docs/spec-v2/01-architecture.md`: SWA name `ebrostay-home`, plan **Standard**, region per the Task 2 outcome, new default hostname. Add the external tenant as a resource. If the app landed in West Europe, rewrite the note at line 66 about compute and data being in different regions — the Atlantic hop is gone.

- [ ] **Step 6: Add the legal note**

Append to `docs/spec-v2/07-legal-notes.md`: Microsoft as processor for authentication under its DPA; the EU tenant location as the transfer basis; and the no-cookie-banner reasoning from the design spec §5.6, including the Application Insights caveat that would overturn it.

- [ ] **Step 7: Commit**

```bash
git add docs/spec-v2/
git commit -m "docs(spec): ADR-027 retires the borrowed sign-in

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 11 (OPTIONAL — NOT APPROVED): Add Apple sign-in

**Do not start this task without asking.** It commits the user to **$99 USD/year** for the Apple Developer Program and to a **manual client-secret renewal every 6 months**, whose failure mode is Apple sign-in silently breaking for everyone who uses it.

Nothing in Tasks 1–10 depends on this. Apple is one more provider in the same user flow.

**Files:** none — portal work only.

- [ ] **Step 1: Create the Apple identifiers**

In the Apple Developer portal (paid membership required): **Certificates, IDs, & Profiles** → register an **App ID** with the **Sign in with Apple** capability. Note the **Team ID**. Then register a **Services ID** — its identifier is the client ID.

Configure Sign in with Apple on the Services ID:
- Domains: `ebrostayid.ciamlogin.com`
- Return URL: `https://ebrostayid.ciamlogin.com/<TENANT_ID>/federation/oauth2`

- [ ] **Step 2: Create the signing key**

**Keys** → **+** → enable **Sign in with Apple** → register → note the **Key ID** and download the `.p8` file. It downloads once.

- [ ] **Step 3: Configure it in Entra and add it to the user flow**

Entra admin center → **External Identities** → **All identity providers** → **Apple**. Supply the Services ID, Team ID, Key ID and `.p8`. Save. Then **User flows** → your flow → **Identity providers** → tick **Apple** → **Save**.

- [ ] **Step 4: Set the renewal reminder**

Create a calendar reminder for **5 months out** to regenerate the client secret. This is the step that gets forgotten.

- [ ] **Step 5: Verify**

Run the user flow and complete an Apple sign-in. No application code changes — the button appears on the branded page automatically.

---

## Verification checklist

Before calling this done, all of these must have been *run* and *observed*:

- [ ] `cd app && npm run build` — succeeds
- [ ] `cd app && npm test` — passes, including the four new `lib/auth.test.ts` cases
- [ ] `cd app && npm run test:e2e` — passes for every page in `es` and `en`
- [ ] Sign up with a new email address, verify by emailed code, sign in
- [ ] Reset that password via the "forgot password" link
- [ ] Sign in with Google
- [ ] `/.auth/me` returns `identityProvider: "ebrostay"` and a **non-empty** `userDetails`
- [ ] Sign out from `/es/host/manage` — lands on `/es/`, **not** a 403
- [ ] Signed out, visit `/es/host/manage` — redirected to the branded sign-in page, not an error
- [ ] Sign out then sign in again — confirm whether a fresh prompt appears (Task 3 Step 4.4)
- [ ] An admin's `/.auth/me` contains `"admin"` in `userRoles`
- [ ] `az staticwebapp list` shows only `ebrostay-home`
- [ ] `https://ebrostay.com` still serves v1 from GitHub Pages, untouched
