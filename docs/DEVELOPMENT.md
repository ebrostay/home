# Setting up a development machine

Everything needed to run Ebrostay v2 (`redesign/v2`) locally, from a machine
with nothing installed. Nothing here touches Azure — the whole stack runs on
emulators, and **no step requires an Azure subscription**.

Allow about 30 minutes, most of it downloads.

- [1. Prerequisites](#1-prerequisites)
- [2. Clone and install](#2-clone-and-install)
- [3. Local data: Cosmos DB + Blob emulators](#3-local-data-cosmos-db--blob-emulators)
- [4. Configure the API](#4-configure-the-api)
- [5. Create the containers and seed](#5-create-the-containers-and-seed)
- [6. Run it](#6-run-it)
- [7. Sign in as yourself](#7-sign-in-as-yourself)
- [8. Claude Code skills and plugins](#8-claude-code-skills-and-plugins)
- [9. Daily routine](#9-daily-routine)
- [10. Troubleshooting](#10-troubleshooting)

---

## 1. Prerequisites

Versions below are what this was built and verified against. Newer patch
releases are fine.

| Tool | Version | Why |
| --- | --- | --- |
| **Node.js** | 22 LTS or newer (verified on 26.3) | Frontend, SWA CLI, seed scripts |
| **.NET SDK** | **9.x** | The API. **Not 10** — SWA managed functions do not accept `net10` yet (ADR-018) |
| **Azure Functions Core Tools** | v4 (verified 4.12) | Runs the Functions host locally |
| **Azure SWA CLI** | v2 (verified 2.0.10) | Emulates Static Web Apps routing **and auth** |
| **Docker** | any current | Cosmos DB and Blob emulators |
| **Git** | any current | — |

### macOS

```bash
brew install --cask docker
brew install node git
```

.NET 9 via the official script, which installs to `~/.dotnet` and needs no
admin rights:

```bash
curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 9.0
```

Add it to your shell profile (`~/.zshrc`):

```bash
export DOTNET_ROOT="$HOME/.dotnet"
export PATH="$HOME/.dotnet:$PATH"
```

Then the two CLIs:

```bash
npm install -g azure-functions-core-tools@4 @azure/static-web-apps-cli
```

> **On this project's Mac**, npm is configured to block package postinstall
> scripts and Homebrew blocks untrusted taps. Both CLIs still install, but
> **verify by running them** rather than trusting a clean exit:
> `func --version` and `swa --version`.

### Linux

Same, with your distribution's packages for Node, Git and Docker Engine; the
`dotnet-install.sh` line and the two `npm install -g` commands are identical.

### Windows

Use WSL2 and follow the Linux steps. The API is deployed to Linux managed
functions, and SkiaSharp's native assets differ per platform — developing on
the same OS family as production avoids a class of "works here" surprises.

Verify everything at once:

```bash
node -v && dotnet --version && func --version && swa --version && docker --version
```

---

## 2. Clone and install

```bash
git clone <repo-url> ebrostay && cd ebrostay
git checkout redesign/v2
npm install --prefix app
npm install --prefix infra
```

`infra/` has its own tiny dependency set (the Cosmos SDK) used by the bootstrap
and seed scripts. It is not part of the deployed app.

---

## 3. Local data: Cosmos DB + Blob emulators

Two containers, both long-lived — start them once and leave them.

### Cosmos DB

```bash
docker run -d --name ebrostay-cosmos \
  -p 8081:8081 -p 1234:1234 \
  -e PROTOCOL=http \
  mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-preview
```

- `8081` — the gateway the API talks to
- `1234` — the emulator's data explorer, in a browser at <http://localhost:1234>
- `PROTOCOL=http` avoids the self-signed-certificate dance HTTPS mode needs.
  It is already the default in the `vnext-preview` tag, and is passed
  explicitly so that a future tag defaulting back to HTTPS breaks loudly here
  rather than as connection errors in the API.

Give it a minute on first start. It is ready when this returns `200`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8081/
```

### Blob storage (Azurite)

```bash
docker run -d --name ebrostay-blob \
  -p 10000:10000 \
  mcr.microsoft.com/azure-storage/azurite \
  azurite-blob --blobHost 0.0.0.0 --skipApiVersionCheck
```

Photo uploads write here (§2.6). `--skipApiVersionCheck` keeps Azurite from
rejecting a newer Azure SDK than it knows about.

The `property-photos` container is created on first upload by `PhotoStore`, so
there is nothing to set up.

---

## 4. Configure the API

```bash
cp api/local.settings.sample.json api/local.settings.json
```

Then fill it in:

```jsonc
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",

    "COSMOS_ENDPOINT": "http://localhost:8081",
    "COSMOS_KEY": "C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==",
    "COSMOS_DATABASE": "ebrostay",
    "COSMOS_CONNECTION_MODE": "Gateway"
  }
}
```

Three of these are load-bearing and easy to get wrong:

- **`COSMOS_KEY` is the emulator's well-known key.** It is published by
  Microsoft, identical on every machine, and **not a secret**. Real keys never
  go in this file — `local.settings.json` is gitignored, but the rule is that
  secrets live only in Functions app settings (CLAUDE.md).
- **`COSMOS_CONNECTION_MODE=Gateway` is required.** The emulator's gateway does
  not serve direct-mode replica addresses, so the SDK's default (Direct) fails
  with connection errors that look like the emulator being down. Azure is left
  on the default.
- **`PHOTOS_CONNECTION` is not set**, deliberately. It falls back to
  `AzureWebJobsStorage`, so Azurite serves both roles locally and there is one
  fewer setting to keep in step.

---

## 5. Create the containers and seed

The database and its four containers are created in Azure by
`infra/main.bicep`. Locally, one script does the same thing:

```bash
export COSMOS_ENDPOINT=http://localhost:8081
export COSMOS_KEY='C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=='

node infra/local-bootstrap.mjs
node infra/seed.mjs
```

`local-bootstrap.mjs` creates `properties`, `profiles`, `bookingRequests` and
`inquiries` with the partition keys from §2.1. It refuses to run against any
endpoint that is not localhost.

`seed.mjs` upserts the four sample homes. Both are idempotent — re-run either
whenever local data gets messy.

> The seeded listings point at **photo URLs in the real Azure Blob account**,
> which is public-read, so images load without any local upload. Photos you
> upload yourself land in Azurite and get the three derived sizes; the seeded
> ones have only their original, which is expected (§2.2.2).

---

## 6. Run it

Three processes. Separate terminals, or a process manager if you prefer.

```bash
# 1 — frontend
npm run dev --prefix app

# 2 — API
cd api && func start

# 3 — Static Web Apps emulator (routing + auth)
npx swa start http://localhost:3000 --api-devserver-url http://localhost:7071
```

### Browse <http://localhost:4280> — not :3000

This matters more than it looks. The SWA emulator is what injects the
`x-ms-client-principal` header the API reads to identify the caller. On :3000
the frontend runs but **every authenticated call returns 401**, and the pages
that need one look broken for a reason that has nothing to do with them.

| Port | What |
| --- | --- |
| **4280** | **The app.** Use this one. |
| 3000 | Next dev server — proxied by :4280 |
| 7071 | Functions host — proxied to `/api/*` |
| 8081 | Cosmos emulator gateway |
| 1234 | Cosmos data explorer |
| 10000 | Azurite blob |

Static export is only exercised by `npm run build --prefix app`, which must
stay green — `output: "export"` means no middleware, no server components at
runtime, and the dev server is more forgiving than the build is.

---

## 7. Sign in as yourself

The SWA emulator's login page accepts any username and mints a principal from
it. Visit <http://localhost:4280/.auth/login/github>, enter anything, and the
API will treat you as that user.

Seeded listings belong to a placeholder host (`seed-host`), so they are public
but appear in nobody's portfolio. To own them — which you need in order to see
Manage and the listing editor at all — re-seed with your own principal id.

Signed in, open <http://localhost:4280/api/me> **in the browser** and copy
`userId`, then:

```bash
SEED_HOST_ID=<that id> node infra/seed.mjs
```

It has to be the browser: the emulator identifies you by a session cookie, so
a bare `curl` to `/api/me` answers `"authenticated": false` and would seed a
`null` owner. The id is derived from provider + username and is stable, so this
survives restarts and re-seeds.

---

## 8. Claude Code skills and plugins

Two skills are **vendored into the repo** and need no installation — they are
picked up automatically:

| Skill | Use it for |
| --- | --- |
| `.claude/skills/frontend-design/` | Any visual or UI work. The v2 visual identity was built with it. Keep the Ebrostay logo. |
| `.claude/skills/cosmosdb-best-practices/` | Anything touching Cosmos: data modelling, partition keys, queries, indexing, C# SDK usage. Vendored (MIT) from the [azure-cosmos-db-assistant plugin](https://github.com/AzureCosmosDB/cosmosdb-claude-code-plugin); re-sync by copying `skills/` from upstream. |

The **superpowers** plugin is enabled in `.claude/settings.json`, but the
payload lives in `~/.claude/plugins/` — so every new machine needs it
installed once:

```bash
npm install -g @anthropic-ai/claude-code
claude plugin install superpowers@claude-plugins-official
```

**Takes effect on the next session**, not the current one. It supplies the
workflow skills — brainstorming, planning, TDD, systematic debugging.

### The rest of `.claude/`

| File | Tracked? | What it is |
| --- | --- | --- |
| `settings.json` | yes | Enables the superpowers plugin. The whole file. |
| `launch.json` | yes | Dev-server definitions for the in-app browser preview: `app-dev` on :3000, `app-dev-verify` on :3020 for checking a change without disturbing a running :3000. |
| `skills/` | yes | The two vendored skills above. |
| `settings.local.json` | **no** — gitignored | Personal tool permissions. Yours will not exist until you create it, and nothing here depends on it. |

One trap in `launch.json`: it starts **Next alone on :3000**, which is the
right thing for a preview pane but is *not* the running app. The SWA emulator
still has to be started separately, and you still browse **:4280** (§6).
Anything behind sign-in will 401 against a bare :3000 preview.

Read `CLAUDE.md` before your first change. The conventions that bite hardest:
bilingual ES/EN is a hard requirement (every string in both message files),
light and dark are both first-class, `Link`/`useRouter` come from
`@/i18n/navigation` and never from `next/*`, and authorization is enforced in
the C# functions rather than in route rules or UI gates.

---

## 9. Daily routine

Containers survive reboots unless removed:

```bash
docker start ebrostay-cosmos ebrostay-blob
```

Before pushing:

```bash
npm run build --prefix app     # static export must stay green
npm run lint --prefix app
dotnet build api
```

> `npm run lint` currently reports **5 pre-existing errors** in
> `app/not-found.tsx` and `components/site/ThemeToggle.tsx`. They are not
> yours; the bar is not adding to them.

---

## 10. Troubleshooting

**Everything authenticated returns 401**
You are on :3000. Use :4280 — see §6.

**API logs show Cosmos connection failures, but the emulator is running**
`COSMOS_CONNECTION_MODE` is missing or not `Gateway`. See §4.

**`func start` cannot find the runtime**
`DOTNET_ROOT` and `PATH` are not exported in the shell running it. The
install script does not touch your profile.

**Photo upload returns 502**
Azurite is not running, or `AzureWebJobsStorage` is not
`UseDevelopmentStorage=true`. Check `docker ps`.

**Photo upload returns 400**
Read the error code — the pipeline refuses by reason. `photo_heic` means
exactly that (export as JPEG); `photo_svg`, `photo_not_an_image` and
`photo_too_large` likewise. These are deliberate refusals, not failures. Full
rules: the ADR-019 amendment in `docs/spec-v2/05-decision-log.md`.

**A React "script tag" error in the browser console**
Dev-only noise from the theme bootstrap script in
`app/app/[locale]/layout.tsx`. Harmless — look past it for the real error.

**The Catastro panel says the service is unreachable**
It genuinely is, intermittently. The client retries once automatically and
then offers a button (ADR-027). Not a local configuration problem.

**Seeded data has drifted during testing**
Re-run `node infra/seed.mjs`. To start completely clean:

```bash
docker rm -f ebrostay-cosmos ebrostay-blob
```

then repeat §3 and §5.

---

## What is deliberately not here

- **Azure credentials.** Nothing local needs them. Deployment is by GitHub
  Actions from `redesign/v2`; provisioning is `infra/main.bicep`, with
  `infra/provision.sh` kept as history.
- **A test runner.** There is no automated test gate yet — verification is by
  running the app. Adding one is open decision OD-1's dependency.
- **The DeepSeek key.** The AI assistant (ADR-020) is not built; when it is, a
  missing key degrades to `503 ai_not_configured` and the editor keeps working.
