# AI-assisted import ("Start faster") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner pastes a portal URL on a new screen in front of the wizard, waits under a minute, and lands on step 1 with ~20 fields filled and visibly marked as machine-proposed.

**Architecture:** An asynchronous job spine. `POST /api/import` writes a job document to Cosmos and enqueues it; a third-party extraction pipeline dequeues, reads the portal page, and POSTs results back to an anonymous callback authenticated by a per-job token; the browser polls a 1 RU point read. The result lands on the **job**, never on the listing — the merge is client-side, because only the client knows which fields the owner has already typed into.

**Tech Stack:** C# .NET 9 isolated Azure Functions (SWA managed), Cosmos DB NoSQL, Azure Storage Queues, Next.js App Router static export, TypeScript, next-intl, Tailwind v4, vitest, Playwright, xUnit.

**Spec:** `docs/superpowers/specs/2026-07-30-ai-assisted-import-design.md`
**Decisions:** ADR-033 in `docs/spec-v2/05-decision-log.md`

## Global Constraints

- **Bilingual ES/EN is a hard requirement.** Every user-facing string goes in `app/messages/es.json` **and** `app/messages/en.json`. Spanish is default. The status line and the policy reasons are the copy doing the trust work — **keep the reasons whole in Spanish**, do not shorten them to fit.
- Import `Link`/`useRouter` from `@/i18n/navigation`, never from `next/link`/`next/navigation`.
- Light and dark mode are both first-class. Theme is `data-theme` on `<html>`; use the Tailwind `dark:` variant. **Never** use `@media (prefers-color-scheme)`.
- **Static export**: no middleware, no route handlers, no server components at runtime. Dynamic data is fetched client-side from `/api/*`.
- **Authorization is enforced in the C# functions** by reading `x-ms-client-principal`, never via SWA route rules or UI gates. The one exception is the callback endpoint, which is anonymous by design and authenticated by a per-job token.
- Secrets never in the client or repo — Functions app settings only. `api/local.settings.json` is gitignored and holds the real `ORS_API_KEY`; **never read, print, grep or commit it.**
- The deployed Cosmos database must not be written to. Local emulator only.
- `cd app && npm run build` must stay green. `cd app && npm test`, `cd app && npm run test:e2e` and `~/.dotnet/dotnet test api/Ebrostay.Api.Tests` must stay green.
- **`imported` is never inferred from "field is non-empty"** — a field the owner typed and a field we filled look identical in the data.
- **The English is never imported.** Implemented structurally: the callback DTOs have no `en` member, so English is unrepresentable rather than stripped. This is the same idiom `RichNode`/`RichMark` already use ("a link mark is not rejected — it is unrepresentable, because there is nowhere for an href to live").
- **The price is carried across unchanged.** Never multiply by 30/31. Portals quote a calendar month; ADR-023's field is thirty days flat, and the pricing banner says so.
- Banner variants are chosen by `StepKey`, **never by step number** — the design handoff's §10.3–10.5 numbers predate the ninth step and are off by one past the first.

---

## File Structure

**API (C#)**

| File | Responsibility |
| --- | --- |
| `api/Models/ImportModels.cs` (create) | Job document, stages, the six sources + host matcher, the key vocabulary, the queue-message record, `ImportJobView`. Pure — no I/O. |
| `api/Models/ImportWrites.cs` (create) | Request and callback DTOs, plus `ImportValidation`: key checks, clamps, plain-text→`RichNode` paragraph builder. Pure. |
| `api/Services/ImportQueue.cs` (create) | Enqueue, and the optional fire-and-forget wakeup ping. |
| `api/Services/ImportBudget.cs` (create) | Per-owner daily import ceiling in the existing `serviceBudget` container. Mirrors `OrsBudget`. |
| `api/Functions/ImportFunctions.cs` (create) | The four endpoints. |
| `api/Models/PropertyDoc.cs` (modify) | `Imported`, `ImportSource`. |
| `api/Models/HostModels.cs` (modify) | `HostListing` gains the same two; projection carries them. |
| `api/Models/HostWrites.cs` (modify) | Validate them on the content save. |
| `api/Program.cs` (modify) | Register `QueueServiceClient`, `ImportQueue`, `ImportBudget`. |
| `api/Ebrostay.Api.csproj` (modify) | `Azure.Storage.Queues`. |

**Client (TypeScript)**

| File | Responsibility |
| --- | --- |
| `app/lib/import.ts` (create) | The six sources and host matching, the key vocabulary, `mergeImport`, `clearMark`, `stageLine`, poll timing. Pure, no React. |
| `app/lib/api.ts` (modify) | `startImport`, `fetchImportJob`, `cancelImport`, and the types. `HostListing` gains the two new fields. |
| `app/components/host/new/import/StartScreen.tsx` (create) | `phase === "start"`. |
| `app/components/host/new/import/ReadingScreen.tsx` (create) | `phase === "reading"`. |
| `app/components/host/new/import/ImportBanner.tsx` (create) | The per-step river panel. |
| `app/components/host/new/import/ImportMark.tsx` (create) | The 13px arrow-into-tray glyph. |
| `app/app/[locale]/host/new/page.tsx` (modify) | Phase state, the poll, the merge, `?import=` handling. |
| `app/messages/{es,en}.json` (modify) | Every string. |

**Infra and test**

| File | Responsibility |
| --- | --- |
| `infra/main.bicep` (modify) | `importJobs` container, `import-jobs` queue, two app settings. |
| `infra/stub-extractor.mjs` (create) | Drains the queue, posts stages then a canned Idealista fixture. |
| `api/Ebrostay.Api.Tests/ImportTests.cs` (create) | Model, validation, endpoint tests. |
| `app/lib/import.test.ts` (create) | vitest for the pure client logic. |
| `app/e2e/` (modify) | Fixtures and a case for the new screens. |

---

## Task 1: Persist `imported` and `importSource` on the property document

The marks are the entire review surface — the design cut the summary screen — so a reload that clears them hands the owner a form where twenty machine-proposed values are indistinguishable from their own. Independent of the rest of the plan; it can be reviewed and merged on its own.

**Files:**
- Modify: `api/Models/PropertyDoc.cs`
- Modify: `api/Models/HostModels.cs`
- Modify: `api/Models/HostWrites.cs`
- Modify: `app/lib/api.ts`
- Test: `api/Ebrostay.Api.Tests/ImportTests.cs` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `PropertyDoc.Imported` (`string[]?`), `PropertyDoc.ImportSource` (`string?`), the same two on `HostListing` (C# and TS), and `HostValidation.CheckImported(string[]? imported, string? source) → string?` returning an error code or null.

- [ ] **Step 1: Write the failing test**

Create `api/Ebrostay.Api.Tests/ImportTests.cs`:

```csharp
using Ebrostay.Api.Models;
using Xunit;

namespace Ebrostay.Api.Tests;

public class ImportedFieldTests
{
    [Fact]
    public void KnownKeysAreAccepted()
    {
        Assert.Null(HostValidation.CheckImported(["price", "name", "amenities"], "idealista"));
    }

    [Fact]
    public void UnknownKeyIsRejected()
    {
        Assert.Equal("imported_unknown_field",
            HostValidation.CheckImported(["price", "hostBankAccount"], "idealista"));
    }

    [Fact]
    public void TooManyKeysAreRejected()
    {
        var keys = Enumerable.Repeat("price", 33).ToArray();
        Assert.Equal("imported_too_many", HostValidation.CheckImported(keys, "idealista"));
    }

    [Fact]
    public void UnknownSourceIsRejected()
    {
        Assert.Equal("import_source_invalid",
            HostValidation.CheckImported(["price"], "craigslist"));
    }

    [Fact]
    public void NullsAreAccepted()
    {
        // A listing that was never imported carries neither field.
        Assert.Null(HostValidation.CheckImported(null, null));
    }

    [Fact]
    public void MarksWithoutASourceAreRejected()
    {
        // A mark says "filled from Idealista"; without a source the banner has
        // nothing to name and the glyph means nothing.
        Assert.Equal("import_source_invalid", HostValidation.CheckImported(["price"], null));
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `~/.dotnet/dotnet test api/Ebrostay.Api.Tests --filter ImportedFieldTests`
Expected: FAIL — `HostValidation` does not contain a definition for `CheckImported`.

- [ ] **Step 3: Add the key vocabulary and the source list**

Create `api/Models/ImportModels.cs` with only what this task needs (later tasks extend the same file):

```csharp
namespace Ebrostay.Api.Models;

// The AI-assisted import (ADR-033). Nothing here does I/O.

/// One source we will read, and how its host is recognised. `AnyTld` exists
/// for the two international sites: Airbnb and Booking answer on dozens of
/// TLDs and an owner will paste whichever one their browser gave them.
public record ImportSourceDef(string Key, string[] Domains, bool AnyTld);

public static class ImportSources
{
    /// The closed list. Named on screen BEFORE anything is pasted, because an
    /// unmapped page puts values in the wrong fields and a wrong field the
    /// owner did not notice is worse than an empty form.
    public static readonly ImportSourceDef[] All =
    [
        new("idealista",  ["idealista.com"],  false),
        new("fotocasa",   ["fotocasa.es"],    false),
        new("habitaclia", ["habitaclia.com"], false),
        new("pisos",      ["pisos.com"],      false),
        new("airbnb",     ["airbnb"],         true),
        new("booking",    ["booking"],        true),
    ];

    public static bool IsKnown(string? key) =>
        key is not null && All.Any(s => s.Key == key);
}

/// Every field an import may claim to have filled. The client's copy is
/// `IMPORT_KEYS` in app/lib/import.ts and the two must stay equal — this list
/// is what the mark renderer iterates and what the callback validates, so a
/// drift is either an unmarked field or a rejected callback.
///
/// Grouped controls carry ONE key for the group, not one per option: `type`,
/// `energyRating`, `amenities`, `billsPolicy`, `minStayMonths` and each house
/// rule. A portal's feature list mapping to nine of fifteen amenities is still
/// one answer to one question.
public static class ImportKeys
{
    public static readonly HashSet<string> All = new(StringComparer.Ordinal)
    {
        "address", "postcode", "pin", "area", "cadastralRef",
        "name", "type", "sizeM2", "bedrooms", "bathrooms", "guests",
        "floorNumber", "energyRating",
        "copy", "details", "beds",
        "amenities",
        "price", "billsPolicy", "utilitiesCapEur", "depositAmount", "minStayMonths",
        "petsAllowed", "smokingAllowed", "couplesAllowed", "selfCheckin",
    };

    /// 26 keys exist; the cap is what keeps that true when the writer is not a
    /// correct client. Same reasoning as MaxDeclined in HostValidation.
    public const int MaxKeys = 32;
}
```

- [ ] **Step 4: Add `CheckImported` to `HostValidation`**

In `api/Models/HostWrites.cs`, inside `public static class HostValidation`, after `CheckDeclined`:

```csharp
    /// The marks an owner has not yet cleared (ADR-033 Decision 8). Stored, not
    /// derived: a field the owner typed and a field we filled look identical in
    /// the data, so "is it non-empty" cannot answer this.
    public static string? CheckImported(string[]? imported, string? source)
    {
        if (imported is null || imported.Length == 0)
            // No marks and no source is an ordinary listing. A source with no
            // marks is an import the owner has fully reviewed — also fine.
            return source is null || ImportSources.IsKnown(source)
                ? null
                : "import_source_invalid";

        if (imported.Length > ImportKeys.MaxKeys) return "imported_too_many";
        if (imported.Any(k => !ImportKeys.All.Contains(k))) return "imported_unknown_field";
        if (!ImportSources.IsKnown(source)) return "import_source_invalid";
        return null;
    }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `~/.dotnet/dotnet test api/Ebrostay.Api.Tests --filter ImportedFieldTests`
Expected: PASS, 6 tests.

- [ ] **Step 6: Carry the two fields through the document, the projection and the save**

In `api/Models/PropertyDoc.cs`, add to the `PropertyDoc` record's parameter list (as trailing optional parameters so no stored document fails to deserialize):

```csharp
    /// Fields an import filled that the owner has not yet edited (ADR-033).
    /// Null on every listing that was never imported.
    string[]? Imported = null,
    /// Which of the six it came from, for the step banner's eyebrow.
    string? ImportSource = null,
```

In `api/Models/HostModels.cs`, add the same two to the end of the `HostListing` record:

```csharp
    string[]? Imported,
    string? ImportSource,
```

…set them in `HostProjection.ToHostListing` from the document, and read them back in the content-save path in `api/Models/HostWrites.cs` so a save round-trips them. Add the validation call beside the existing checks in `CheckDetails`:

```csharp
        var importedError = CheckImported(listing.Imported, listing.ImportSource);
        if (importedError is not null) return importedError;
```

- [ ] **Step 7: Mirror the two fields on the client type**

In `app/lib/api.ts`, add to `export type HostListing`:

```ts
  /** Fields an import filled that the owner has not yet edited (ADR-033).
   *  Null on every listing that was never imported. Never inferred from
   *  "field is non-empty" — a field the owner typed and a field we filled
   *  look identical in the data. */
  imported: string[] | null;
  /** Which of the six sources, for the step banner's eyebrow. */
  importSource: string | null;
```

In `app/lib/wizard.ts`, add `imported: null` and `importSource: null` to `blankListing()`.

- [ ] **Step 8: Verify the whole build**

Run each and confirm green:

```bash
~/.dotnet/dotnet test api/Ebrostay.Api.Tests
```

```bash
cd app && npx tsc --noEmit && npm test && npm run build
```

- [ ] **Step 9: Commit**

```bash
git add api app && git commit -m "feat(api,app): persist which fields an import filled"
```

---

## Task 2: The import domain model — stages, host matching, callback validation

Everything the feature decides, with no I/O, so all of it is unit-tested before an endpoint exists.

**Files:**
- Modify: `api/Models/ImportModels.cs`
- Create: `api/Models/ImportWrites.cs`
- Test: `api/Ebrostay.Api.Tests/ImportTests.cs`

**Interfaces:**
- Consumes: `ImportSources.All`, `ImportKeys.All` from Task 1.
- Produces: `ImportSources.Match(string url) → string?`; `ImportStage` constants and `ImportStage.IsTerminal`/`Rank`; records `ImportJobDoc`, `ImportJobSource`, `ImportJobView`, `ImportQueueMessage`, `ImportCallback`, `ImportResult`, `ImportListingPatch`, `ImportPricingPatch`, `ImportError`; `ImportValidation.CheckCallback(ImportCallback) → string?`; `ImportValidation.Clamp(ImportResult) → ImportResult`; `RichTextBuilder.ParagraphDoc(string) → RichNode`.

- [ ] **Step 1: Write the failing tests**

Append to `api/Ebrostay.Api.Tests/ImportTests.cs`:

```csharp
public class ImportSourceMatchTests
{
    [Theory]
    [InlineData("https://www.idealista.com/inmueble/107294518/", "idealista")]
    [InlineData("https://idealista.com/inmueble/1/", "idealista")]
    [InlineData("https://www.fotocasa.es/es/alquiler/vivienda/zaragoza/x", "fotocasa")]
    [InlineData("https://www.airbnb.co.uk/rooms/12345", "airbnb")]
    [InlineData("https://www.airbnb.es/rooms/12345", "airbnb")]
    [InlineData("https://www.booking.com/hotel/es/x.html", "booking")]
    public void RecognisesTheSix(string url, string expected) =>
        Assert.Equal(expected, ImportSources.Match(url));

    [Theory]
    [InlineData("https://www.milanuncios.com/x")]
    [InlineData("https://evilidealista.com/x")]      // not a subdomain of ours
    [InlineData("https://airbnb.evil.com/x")]        // brand label, attacker TLD
    [InlineData("https://idealista.com.evil.io/x")]
    [InlineData("file:///etc/passwd")]               // scheme must be http(s)
    [InlineData("http://169.254.169.254/latest/")]   // metadata endpoint
    [InlineData("not a url")]
    public void RefusesEverythingElse(string url) =>
        Assert.Null(ImportSources.Match(url));
}

public class ImportCallbackValidationTests
{
    private static ImportCallback Done(ImportResult result) =>
        new("done", result, null);

    private static ImportResult Result(string[] imported) => new(
        new ImportListingPatch(null, null, null, null, null, null, null, null, null,
                               null, null, null, null, null, null, null, null, null,
                               null, null, null, null),
        new ImportPricingPatch(null, null, null, null, null),
        imported);

    [Fact]
    public void AcceptsAKnownStage() =>
        Assert.Null(ImportValidation.CheckCallback(new("reading", null, null)));

    [Fact]
    public void RejectsAnUnknownStage() =>
        Assert.Equal("stage_invalid", ImportValidation.CheckCallback(new("thinking", null, null)));

    [Fact]
    public void RejectsDoneWithoutAResult() =>
        Assert.Equal("result_required", ImportValidation.CheckCallback(new("done", null, null)));

    [Fact]
    public void RejectsFailedWithoutAnError() =>
        Assert.Equal("error_required", ImportValidation.CheckCallback(new("failed", null, null)));

    [Fact]
    public void RejectsAnUnknownImportedKey() =>
        Assert.Equal("imported_unknown_field",
            ImportValidation.CheckCallback(Done(Result(["price", "ownerIban"]))));

    [Fact]
    public void RejectsAnUnknownErrorCode() =>
        Assert.Equal("error_code_invalid",
            ImportValidation.CheckCallback(new("failed", null, new ImportError("teapot"))));

    [Fact]
    public void AcceptsEveryDesignedErrorCode()
    {
        foreach (var code in ImportError.Codes)
            Assert.Null(ImportValidation.CheckCallback(new("failed", null, new ImportError(code))));
    }
}

public class ImportClampTests
{
    private static ImportResult WithPrice(int price) => new(
        new ImportListingPatch(null, null, null, null, null, null, null, null, null,
                               null, null, null, null, null, null, null, null, null,
                               null, null, null, null),
        new ImportPricingPatch(price, null, null, null, null),
        ["price"]);

    [Fact]
    public void APriceAboveTheCeilingIsDropped()
    {
        var clamped = ImportValidation.Clamp(WithPrice(999_999));
        Assert.Null(clamped.Pricing.PriceNumber);
        // Dropped, not clamped to the ceiling: 50,000 would be a number we
        // invented, and it would arrive wearing a mark that says we read it.
        Assert.DoesNotContain("price", clamped.Imported);
    }

    [Fact]
    public void APlausiblePriceSurvives()
    {
        var clamped = ImportValidation.Clamp(WithPrice(950));
        Assert.Equal(950, clamped.Pricing.PriceNumber);
        Assert.Contains("price", clamped.Imported);
    }
}

public class RichTextBuilderTests
{
    [Fact]
    public void BuildsOneParagraphPerBlankLineSeparatedBlock()
    {
        var doc = RichTextBuilder.ParagraphDoc("First para.\n\nSecond para.");
        Assert.Equal("doc", doc.Type);
        Assert.Equal(2, doc.Content!.Length);
        Assert.Equal("paragraph", doc.Content[0].Type);
        Assert.Equal("First para.", doc.Content[0].Content![0].Text);
    }

    [Fact]
    public void EmptyTextBuildsAnEmptyDoc()
    {
        var doc = RichTextBuilder.ParagraphDoc("   ");
        Assert.Equal("doc", doc.Type);
        Assert.Empty(doc.Content!);
    }
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `~/.dotnet/dotnet test api/Ebrostay.Api.Tests --filter Import`
Expected: FAIL to compile — `ImportSources.Match`, `ImportStage`, `ImportCallback`, `ImportValidation`, `RichTextBuilder` do not exist.

- [ ] **Step 3: Add host matching and the stages**

Append to `api/Models/ImportModels.cs`:

```csharp
public static partial class ImportSourcesMatching { }

public static class ImportStage
{
    public const string Queued = "queued";
    public const string Fetching = "fetching";
    public const string Reading = "reading";
    public const string Matching = "matching";
    public const string Done = "done";
    public const string Failed = "failed";
    public const string Cancelled = "cancelled";

    /// The running stages, in order. Rank exists so an out-of-order report
    /// from a pipeline that retried a step cannot walk the owner's status
    /// line backwards.
    public static readonly string[] Order = [Queued, Fetching, Reading, Matching];

    public static readonly string[] All =
        [Queued, Fetching, Reading, Matching, Done, Failed, Cancelled];

    public static bool IsTerminal(string stage) =>
        stage is Done or Failed or Cancelled;

    public static int Rank(string stage) => Array.IndexOf(Order, stage);
}

public record ImportError(string Code)
{
    /// A closed set, so both locales can name every one of them. Failure
    /// LAYOUT is still to be designed (OD-8); these are the codes it will
    /// have to render.
    public static readonly string[] Codes =
        ["login_wall", "not_found", "withdrawn", "unreadable", "timeout", "pipeline_error"];
}
```

Add `Match` inside `ImportSources`:

```csharp
    /// The pasted URL → one of the six, or null. Deliberately strict: this is
    /// the only thing standing between an owner's paste and a fetch, and a
    /// host we do not map yields values in the wrong fields.
    public static string? Match(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return null;
        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri)) return null;
        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return null;

        var host = uri.Host.ToLowerInvariant();
        if (host.StartsWith("www.", StringComparison.Ordinal)) host = host[4..];

        foreach (var source in All)
        {
            foreach (var domain in source.Domains)
            {
                if (source.AnyTld)
                {
                    // Airbnb and Booking answer on dozens of TLDs. Match the
                    // brand label, then require that everything AFTER it is
                    // TLD-shaped (<= 3 chars) — so airbnb.co.uk matches and
                    // airbnb.evil.com does not.
                    var labels = host.Split('.');
                    var at = Array.IndexOf(labels, domain);
                    if (at >= 0 && at < labels.Length - 1 &&
                        labels.Skip(at + 1).All(l => l.Length is > 0 and <= 3))
                        return source.Key;
                }
                else if (host == domain || host.EndsWith("." + domain, StringComparison.Ordinal))
                {
                    return source.Key;
                }
            }
        }
        return null;
    }
```

- [ ] **Step 4: Add the job document, the view and the queue message**

Append to `api/Models/ImportModels.cs`:

```csharp
/// What was pointed at. A discriminated union from day one so the document
/// flow (`kind: "document"`, OD-7) is additive and does not version the
/// pipeline contract.
public record ImportJobSource(string Kind, string Host, string? Url);

/// The `importJobs` container document. Partitioned on /id because the only
/// access pattern is a point read by job id — which is what makes a 2-second
/// poll cost 1 RU.
public record ImportJobDoc(
    string Id,
    string OwnerId,
    ImportJobSource Source,
    string Stage,
    string CreatedAt,
    string UpdatedAt,
    /// CreatedAt + 5 minutes. A poll that finds a running job past this fails
    /// it — which is why this feature needs no timer trigger, the same lazy
    /// pattern RouteCache uses for stale geometry.
    string DeadlineAt,
    /// NEVER projected to the client. Per-job rather than a shared secret, so
    /// a leak is scoped to one job and dies with it.
    string CallbackToken,
    ImportResult? Result,
    ImportError? Error,
    int Ttl);

/// The job as the owner is allowed to see it. The token is absent by
/// construction, not by remembering to remove it.
public record ImportJobView(
    string JobId,
    string Kind,
    string Host,
    string Stage,
    string CreatedAt,
    ImportResult? Result,
    ImportError? Error);

public record ImportQueueMessage(
    string JobId,
    ImportJobSource Source,
    string CallbackUrl,
    string CallbackToken,
    string DeadlineAt);
```

- [ ] **Step 5: Add the write DTOs and the validator**

Create `api/Models/ImportWrites.cs`:

```csharp
namespace Ebrostay.Api.Models;

// What crosses the wire into the import endpoints (ADR-033 Decision 6).
//
// THE ENGLISH IS UNREPRESENTABLE HERE. `ImportListingPatch` has an `AreaEs`
// and no `AreaEn`, a `CopyEs` and no `CopyEn`. System.Text.Json silently drops
// any JSON property it has no member for, so a pipeline that returns a
// machine-read English paragraph does not get its value rejected — it gets it
// discarded, structurally, with no allowlist to maintain. Same idiom as
// RichMark, which cannot carry an href because there is nowhere for one to
// live. §10.5: an approval gate the owner clicks through is worse than no
// English.

public record ImportStart(string? Url);

/// A partial listing. Every member is nullable and absent means "the portal
/// did not say" — which is NOT the same as "the portal said empty".
public record ImportListingPatch(
    string? Address,
    string? Postcode,
    string? CadastralRef,
    double? Lat,
    double? Lng,
    string? AreaEs,
    string? CopyEs,
    string? DetailsEs,
    string? BedsEs,
    string? Name,
    string? Type,
    int? Guests,
    int? Bedrooms,
    int? Bathrooms,
    int? SizeM2,
    int? FloorNumber,
    string? EnergyRating,
    string[]? Amenities,
    bool? PetsAllowed,
    bool? SmokingAllowed,
    bool? CouplesAllowed,
    bool? SelfCheckin);

public record ImportPricingPatch(
    int? PriceNumber,
    int? DepositAmount,
    string? BillsPolicy,
    int? UtilitiesCapEur,
    int? MinStayMonths);

/// `Imported` is authoritative and travels with the payload. It is never
/// derived from "which fields are non-null" — see the Global Constraints.
public record ImportResult(
    ImportListingPatch Listing,
    ImportPricingPatch Pricing,
    string[] Imported);

public record ImportCallback(string? Stage, ImportResult? Result, ImportError? Error);

public static class ImportValidation
{
    private static readonly string[] BillsPolicies = ["included", "capped", "excluded"];
    private static readonly string[] PropertyTypes = ["apartment", "room", "home"];
    private static readonly string[] EnergyRatings = ["A", "B", "C", "D", "E", "F", "G"];

    public static string? CheckCallback(ImportCallback callback)
    {
        var stage = callback.Stage ?? "";
        if (!ImportStage.All.Contains(stage)) return "stage_invalid";
        if (stage == ImportStage.Done && callback.Result is null) return "result_required";
        if (stage == ImportStage.Failed && callback.Error is null) return "error_required";

        if (callback.Error is not null && !ImportError.Codes.Contains(callback.Error.Code))
            return "error_code_invalid";

        if (callback.Result is { } result)
        {
            if (result.Imported.Length > ImportKeys.MaxKeys) return "imported_too_many";
            if (result.Imported.Any(k => !ImportKeys.All.Contains(k)))
                return "imported_unknown_field";
        }
        return null;
    }

    /// Drop anything implausible, and drop its MARK with it. Not clamped to
    /// the ceiling: a value we invented would arrive wearing a glyph that says
    /// we read it off the owner's own listing, which is the one thing the
    /// glyph must never lie about.
    public static ImportResult Clamp(ImportResult result)
    {
        var dropped = new HashSet<string>(StringComparer.Ordinal);

        int? Bounded(int? value, int min, int max, string key)
        {
            if (value is null) return null;
            if (value < min || value > max) { dropped.Add(key); return null; }
            return value;
        }

        string? Text(string? value, int max, string key)
        {
            if (value is null) return null;
            var trimmed = value.Trim();
            if (trimmed.Length == 0 || trimmed.Length > max) { dropped.Add(key); return null; }
            return trimmed;
        }

        string? OneOf(string? value, string[] allowed, string key)
        {
            if (value is null) return null;
            if (!allowed.Contains(value)) { dropped.Add(key); return null; }
            return value;
        }

        var l = result.Listing;
        var lat = l.Lat; var lng = l.Lng;
        if (lat is not null && (lat < -90 || lat > 90)) { lat = null; dropped.Add("pin"); }
        if (lng is not null && (lng < -180 || lng > 180)) { lng = null; dropped.Add("pin"); }

        var amenities = l.Amenities;
        if (amenities is not null && amenities.Length > HostValidation.MaxAmenities)
        {
            amenities = null; dropped.Add("amenities");
        }

        var postcode = l.Postcode;
        if (postcode is not null && !System.Text.RegularExpressions.Regex.IsMatch(
                postcode, "^[0-9]{5}$"))
        {
            postcode = null; dropped.Add("postcode");
        }

        var listing = l with
        {
            Address = Text(l.Address, HostValidation.MaxAddressLength, "address"),
            Postcode = postcode,
            CadastralRef = Text(l.CadastralRef, 40, "cadastralRef"),
            Lat = lat,
            Lng = lng,
            AreaEs = Text(l.AreaEs, HostValidation.MaxAreaLength, "area"),
            CopyEs = Text(l.CopyEs, HostValidation.MaxCopyLength, "copy"),
            DetailsEs = Text(l.DetailsEs, HostValidation.MaxDetailsLength, "details"),
            BedsEs = Text(l.BedsEs, HostValidation.MaxBedsLength, "beds"),
            Name = Text(l.Name, HostValidation.MaxNameLength, "name"),
            Type = OneOf(l.Type, PropertyTypes, "type"),
            Guests = Bounded(l.Guests, 1, HostValidation.MaxGuests, "guests"),
            Bedrooms = Bounded(l.Bedrooms, 1, HostValidation.MaxRooms, "bedrooms"),
            Bathrooms = Bounded(l.Bathrooms, 1, HostValidation.MaxRooms, "bathrooms"),
            SizeM2 = Bounded(l.SizeM2, 1, HostValidation.MaxSizeM2, "sizeM2"),
            FloorNumber = Bounded(l.FloorNumber, HostValidation.MinFloor,
                                  HostValidation.MaxFloor, "floorNumber"),
            EnergyRating = OneOf(l.EnergyRating, EnergyRatings, "energyRating"),
            Amenities = amenities,
        };

        var p = result.Pricing;
        var pricing = p with
        {
            PriceNumber = Bounded(p.PriceNumber, 1, HostValidation.MaxPrice, "price"),
            DepositAmount = Bounded(p.DepositAmount, 1, HostValidation.MaxDeposit, "depositAmount"),
            BillsPolicy = OneOf(p.BillsPolicy, BillsPolicies, "billsPolicy"),
            UtilitiesCapEur = Bounded(p.UtilitiesCapEur, 1, HostValidation.MaxCap, "utilitiesCapEur"),
            MinStayMonths = Bounded(p.MinStayMonths, 1, 11, "minStayMonths"),
        };

        return new ImportResult(listing, pricing,
            result.Imported.Where(k => !dropped.Contains(k)).ToArray());
    }
}

/// Plain text from an extractor → the closed description schema (ADR-032).
/// Mirrors `paragraphDoc` in app/lib/rich-text.ts, except that it splits on
/// blank lines: a portal description is several paragraphs and collapsing them
/// into one would be an edit, not a transfer.
public static class RichTextBuilder
{
    public static RichNode ParagraphDoc(string? text)
    {
        var paragraphs = (text ?? "")
            .Replace("\r\n", "\n")
            .Split("\n\n", StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => p.Length > 0)
            .Select(p => new RichNode("paragraph",
                [new RichNode("text", null, p, null, null)], null, null, null))
            .ToArray();

        return new RichNode("doc", paragraphs, null, null, null);
    }
}
```

Delete the `ImportSourcesMatching` placeholder line added in Step 3 — it was scaffolding and nothing references it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `~/.dotnet/dotnet test api/Ebrostay.Api.Tests --filter Import`
Expected: PASS. Fix any compile warnings; the project builds with `Nullable` enabled and warnings matter.

- [ ] **Step 7: Commit**

```bash
git add api && git commit -m "feat(api): import domain model, host matching and callback validation"
```

---

## Task 3: Queue, budget and infrastructure

The thin Azure wiring. Nothing here makes a decision — every decision was made and tested in Task 2.

**Files:**
- Modify: `api/Ebrostay.Api.csproj`
- Create: `api/Services/ImportQueue.cs`
- Create: `api/Services/ImportBudget.cs`
- Modify: `api/Program.cs`
- Modify: `api/local.settings.sample.json`
- Modify: `infra/main.bicep`

**Interfaces:**
- Consumes: `ImportQueueMessage`, `ImportJobSource` from Task 2.
- Produces: `ImportQueue.EnqueueAsync(ImportQueueMessage, CancellationToken)`; `ImportBudget.TryConsumeAsync(string ownerId, CancellationToken) → Task<bool>`.

- [ ] **Step 1: Add the package**

In `api/Ebrostay.Api.csproj`, beside `Azure.Storage.Blobs`:

```xml
    <PackageReference Include="Azure.Storage.Queues" Version="12.*" />
```

Run `~/.dotnet/dotnet build api` and confirm it restores.

- [ ] **Step 2: Write the queue service**

Create `api/Services/ImportQueue.cs`:

```csharp
using System.Text.Json;
using Azure.Storage.Queues;
using Ebrostay.Api.Models;
using Microsoft.Extensions.Logging;

namespace Ebrostay.Api.Services;

/// Handover to the extraction pipeline (ADR-033 Decision 3).
///
/// The queue is the source of truth, and the wakeup ping is advisory: if the
/// ping fails the job is late, not lost. That is the whole reason the ping is
/// allowed to be fire-and-forget against a third party we do not control.
public sealed class ImportQueue(QueueServiceClient queues, IHttpClientFactory http,
    ILogger<ImportQueue> logger)
{
    public const string QueueName = "import-jobs";

    private static readonly JsonSerializerOptions Json =
        new(JsonSerializerDefaults.Web);

    public async Task EnqueueAsync(ImportQueueMessage message, CancellationToken ct)
    {
        var client = queues.GetQueueClient(QueueName);
        await client.CreateIfNotExistsAsync(cancellationToken: ct);
        await client.SendMessageAsync(JsonSerializer.Serialize(message, Json),
            cancellationToken: ct);

        var wakeup = Environment.GetEnvironmentVariable("PIPELINE_WAKEUP_URL");
        if (string.IsNullOrWhiteSpace(wakeup)) return;

        try
        {
            using var client2 = http.CreateClient("wakeup");
            using var body = new StringContent(
                JsonSerializer.Serialize(new { jobId = message.JobId }, Json),
                System.Text.Encoding.UTF8, "application/json");
            await client2.PostAsync(wakeup, body, ct);
        }
        catch (Exception ex)
        {
            // Deliberately swallowed. The queue already holds the job; a
            // failed ping costs the owner latency, never the read.
            logger.LogWarning(ex, "Import wakeup ping failed for {JobId}", message.JobId);
        }
    }
}
```

- [ ] **Step 3: Write the budget service**

Create `api/Services/ImportBudget.cs`:

```csharp
using System.Globalization;
using Ebrostay.Api.Models;
using Microsoft.Azure.Cosmos;

namespace Ebrostay.Api.Services;

/// A per-owner daily ceiling on imports, held in Cosmos for the same reason
/// OrsBudget is: SWA managed functions scale out and share no memory, so an
/// in-process counter is one counter per instance and no ceiling at all.
///
/// FAILS CLOSED, like OrsBudget. If the count cannot be confirmed we do not
/// start a read — the alternative is an unbounded bill against a third party.
public sealed class ImportBudget(Container container)
{
    /// Twenty reads is far more than an owner with eight drafts can need, and
    /// low enough that a script pasting URLs stops mattering.
    public const int DailyCeiling = 20;
    private const int MaxAttempts = 5;

    public async Task<bool> TryConsumeAsync(string ownerId, CancellationToken ct)
    {
        // InvariantCulture: this becomes a Cosmos id and partition key, and
        // DateTimeOffset's "yyyy" is calendar-dependent under some cultures.
        var id = string.Create(CultureInfo.InvariantCulture,
            $"import-{ownerId}-{DateTimeOffset.UtcNow:yyyy-MM-dd}");
        var key = new PartitionKey(id);

        for (var attempt = 0; attempt < MaxAttempts; attempt++)
        {
            try
            {
                var read = await container.ReadItemAsync<OrsBudgetDoc>(id, key,
                    cancellationToken: ct);
                if (read.Resource.Calls + 1 > DailyCeiling) return false;

                await container.ReplaceItemAsync(
                    read.Resource with { Calls = read.Resource.Calls + 1 }, id, key,
                    new ItemRequestOptions { IfMatchEtag = read.ETag }, ct);
                return true;
            }
            catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                try
                {
                    await container.CreateItemAsync(new OrsBudgetDoc(id, 1, 172800), key,
                        cancellationToken: ct);
                    return true;
                }
                catch (CosmosException c)
                    when (c.StatusCode == System.Net.HttpStatusCode.Conflict)
                {
                    // Another instance created it between our read and write.
                }
            }
            catch (CosmosException e)
                when (e.StatusCode == System.Net.HttpStatusCode.PreconditionFailed)
            {
                // Another instance incremented it. Re-read and retry.
            }
        }
        return false;
    }
}
```

- [ ] **Step 4: Register everything**

In `api/Program.cs`, after the `BlobServiceClient` singleton:

```csharp
// Queue client. Same singleton rule as Blob and Cosmos — it pools connections.
// Falls back to AzureWebJobsStorage so a local run needs one setting, not two.
builder.Services.AddSingleton(_ =>
{
    var connection = Environment.GetEnvironmentVariable("IMPORTS_CONNECTION")
        ?? Environment.GetEnvironmentVariable("AzureWebJobsStorage")
        ?? throw new InvalidOperationException("IMPORTS_CONNECTION not set");
    return new Azure.Storage.Queues.QueueServiceClient(connection);
});

builder.Services.AddHttpClient("wakeup", c =>
{
    // Short on purpose. The ping is advisory; the queue already holds the job,
    // so waiting on an unresponsive third party would only delay the owner's
    // 202 for nothing.
    c.Timeout = TimeSpan.FromSeconds(2);
});

builder.Services.AddSingleton<Ebrostay.Api.Services.ImportQueue>();
builder.Services.AddSingleton(sp => new Ebrostay.Api.Services.ImportBudget(
    sp.GetRequiredService<Database>().GetContainer("serviceBudget")));
```

- [ ] **Step 5: Add the container and queue to the infrastructure**

In `infra/main.bicep`, add to the `containers` array:

```bicep
  // Import jobs (ADR-033). Partitioned on /id: the only access pattern is a
  // point read by job id, which is what makes a 2s poll cost 1 RU. Seven-day
  // TTL — a job is a transaction, not a record.
  { name: 'importJobs', partitionKey: '/id', defaultTtl: 604800, indexingPolicy: null }
```

Add the queue beside the existing `blobService`/`photosContainer` resources:

```bicep
resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

resource importQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  parent: queueService
  name: 'import-jobs'
}
```

Add `PIPELINE_WAKEUP_URL` (empty string) and `IMPORT_CALLBACK_BASE_URL` to `swaAppSettings`.

- [ ] **Step 6: Document the local settings**

In `api/local.settings.sample.json`, add `"IMPORT_CALLBACK_BASE_URL": "http://localhost:4280"` and `"PIPELINE_WAKEUP_URL": ""`. Do **not** open or edit `api/local.settings.json` — it holds the real ORS key.

- [ ] **Step 7: Verify the build**

Run: `~/.dotnet/dotnet build api && ~/.dotnet/dotnet test api/Ebrostay.Api.Tests`
Expected: build clean with no new warnings, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add api infra && git commit -m "feat(api,infra): import queue, per-owner budget, importJobs container"
```

---

## Task 4: The four endpoints

**Files:**
- Create: `api/Functions/ImportFunctions.cs`
- Test: `api/Ebrostay.Api.Tests/ImportTests.cs`

**Interfaces:**
- Consumes: everything from Tasks 2 and 3.
- Produces: `POST /api/import`, `GET /api/import/{jobId}`, `POST /api/import/{jobId}/callback`, `DELETE /api/import/{jobId}`; `ImportProjection.ToView(ImportJobDoc) → ImportJobView`.

- [ ] **Step 1: Write the failing tests**

Append to `api/Ebrostay.Api.Tests/ImportTests.cs`:

```csharp
public class ImportProjectionTests
{
    private static ImportJobDoc Job(string stage) => new(
        "imp_1", "owner-1", new ImportJobSource("url", "idealista", "https://x"),
        stage, "2026-07-30T09:00:00Z", "2026-07-30T09:00:00Z", "2026-07-30T09:05:00Z",
        "s3cr3t", null, null, 604800);

    [Fact]
    public void TheViewCannotCarryTheToken()
    {
        var view = ImportProjection.ToView(Job(ImportStage.Reading));
        var json = System.Text.Json.JsonSerializer.Serialize(view);
        Assert.DoesNotContain("s3cr3t", json);
        Assert.DoesNotContain("callbackToken", json);
    }

    [Fact]
    public void TheViewDoesNotEchoTheUrl()
    {
        // The client already has what it pasted. Echoing it back is a second
        // copy of a value we have no reason to hold twice.
        var json = System.Text.Json.JsonSerializer.Serialize(
            ImportProjection.ToView(Job(ImportStage.Reading)));
        Assert.DoesNotContain("https://x", json);
    }
}

public class ImportStageProgressionTests
{
    [Fact]
    public void ARunningStageNeverGoesBackwards()
    {
        Assert.True(ImportStage.Rank(ImportStage.Matching) > ImportStage.Rank(ImportStage.Reading));
    }

    [Theory]
    [InlineData("done")]
    [InlineData("failed")]
    [InlineData("cancelled")]
    public void TerminalStagesAreTerminal(string stage) =>
        Assert.True(ImportStage.IsTerminal(stage));

    [Theory]
    [InlineData("queued")]
    [InlineData("reading")]
    public void RunningStagesAreNot(string stage) =>
        Assert.False(ImportStage.IsTerminal(stage));
}
```

- [ ] **Step 2: Run them to verify they fail**

Run: `~/.dotnet/dotnet test api/Ebrostay.Api.Tests --filter ImportProjection`
Expected: FAIL — `ImportProjection` does not exist.

- [ ] **Step 3: Write the functions**

Create `api/Functions/ImportFunctions.cs`:

```csharp
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace Ebrostay.Api.Functions;

// The AI-assisted import (ADR-033). Four endpoints, one job document.
//
// The result lands on the JOB, never on the listing: the merge is client-side,
// because only the client knows which fields the owner has already typed into.
// So nothing here writes to `properties`, and HostWrites validation is
// untouched by this whole feature.
public class ImportFunctions(
    Database database,
    ProfileService profiles,
    ImportQueue queue,
    ImportBudget budget,
    ILogger<ImportFunctions> logger)
{
    private Container Jobs => database.GetContainer("importJobs");

    /// Two at once is enough for anyone who is not scripting us.
    private const int MaxRunningPerOwner = 2;
    private static readonly TimeSpan Deadline = TimeSpan.FromMinutes(5);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Function("ImportStart")]
    public async Task<IActionResult> Start(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "import")] HttpRequest req,
        CancellationToken ct)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var body = await JsonSerializer.DeserializeAsync<ImportStart>(req.Body, Json, ct);
        var host = ImportSources.Match(body?.Url);
        if (host is null) return Bad("unsupported_host");

        if (await RunningCountAsync(profile!.Id, ct) >= MaxRunningPerOwner)
            return TooMany("too_many_imports");
        if (!await budget.TryConsumeAsync(profile.Id, ct))
            return TooMany("daily_import_limit");

        var now = DateTimeOffset.UtcNow;
        var job = new ImportJobDoc(
            Id: $"imp_{Guid.NewGuid():N}",
            OwnerId: profile.Id,
            Source: new ImportJobSource("url", host, body!.Url!.Trim()),
            Stage: ImportStage.Queued,
            CreatedAt: now.ToString("o"),
            UpdatedAt: now.ToString("o"),
            DeadlineAt: now.Add(Deadline).ToString("o"),
            CallbackToken: Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
                .Replace('+', '-').Replace('/', '_').TrimEnd('='),
            Result: null,
            Error: null,
            Ttl: 604800);

        await Jobs.CreateItemAsync(job, new PartitionKey(job.Id), cancellationToken: ct);

        var baseUrl = Environment.GetEnvironmentVariable("IMPORT_CALLBACK_BASE_URL")
            ?? $"{req.Scheme}://{req.Host}";
        await queue.EnqueueAsync(new ImportQueueMessage(
            job.Id, job.Source, $"{baseUrl}/api/import/{job.Id}/callback",
            job.CallbackToken, job.DeadlineAt), ct);

        return new ObjectResult(new { jobId = job.Id, stage = job.Stage })
        {
            StatusCode = StatusCodes.Status202Accepted,
        };
    }

    [Function("ImportGet")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "import/{jobId}")]
        HttpRequest req, string jobId, CancellationToken ct)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var job = await ReadAsync(jobId, ct);
        // 404, not 403: a job id is not a thing to confirm the existence of.
        if (job is null || job.OwnerId != profile!.Id) return new NotFoundResult();

        // THE REAPER. A running job past its deadline fails here, which is why
        // this feature needs no timer trigger — the same lazy pattern
        // RouteCache uses for stale geometry.
        if (!ImportStage.IsTerminal(job.Stage) &&
            DateTimeOffset.TryParse(job.DeadlineAt, out var deadline) &&
            DateTimeOffset.UtcNow > deadline)
        {
            job = job with
            {
                Stage = ImportStage.Failed,
                Error = new ImportError("timeout"),
                UpdatedAt = DateTimeOffset.UtcNow.ToString("o"),
            };
            await ReplaceAsync(job, ct);
        }

        return new OkObjectResult(ImportProjection.ToView(job));
    }

    [Function("ImportCallback")]
    public async Task<IActionResult> Callback(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "import/{jobId}/callback")]
        HttpRequest req, string jobId, CancellationToken ct)
    {
        // ANONYMOUS BY DESIGN. The pipeline is third-party and holds no
        // account with us; the per-job token is the credential, and a leak is
        // scoped to one job and dies with it.
        var job = await ReadAsync(jobId, ct);
        if (job is null) return new NotFoundResult();

        var presented = req.Headers["X-Import-Token"].ToString();
        if (!FixedTimeEquals(presented, job.CallbackToken)) return new NotFoundResult();

        var callback = await JsonSerializer.DeserializeAsync<ImportCallback>(req.Body, Json, ct);
        if (callback is null) return Bad("body_required");

        var invalid = ImportValidation.CheckCallback(callback);
        if (invalid is not null) return Bad(invalid);

        // Idempotent: at-least-once delivery means the pipeline may report the
        // same completion twice, and a cancelled job may be reported done.
        if (ImportStage.IsTerminal(job.Stage))
            return new ConflictObjectResult(new { error = "job_finished" });

        var stage = callback.Stage!;
        // Never walk the owner's status line backwards.
        if (!ImportStage.IsTerminal(stage) && ImportStage.Rank(stage) < ImportStage.Rank(job.Stage))
            return new OkResult();

        job = job with
        {
            Stage = stage,
            Result = callback.Result is null ? job.Result : ImportValidation.Clamp(callback.Result),
            Error = callback.Error ?? job.Error,
            UpdatedAt = DateTimeOffset.UtcNow.ToString("o"),
        };
        await ReplaceAsync(job, ct);
        return new OkResult();
    }

    [Function("ImportCancel")]
    public async Task<IActionResult> Cancel(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "import/{jobId}")]
        HttpRequest req, string jobId, CancellationToken ct)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        var job = await ReadAsync(jobId, ct);
        if (job is null || job.OwnerId != profile!.Id) return new NotFoundResult();
        if (ImportStage.IsTerminal(job.Stage)) return new NoContentResult();

        await ReplaceAsync(job with
        {
            Stage = ImportStage.Cancelled,
            UpdatedAt = DateTimeOffset.UtcNow.ToString("o"),
        }, ct);
        return new NoContentResult();
    }

    // -----------------------------------------------------------------------

    private static bool FixedTimeEquals(string presented, string expected)
    {
        var a = Encoding.UTF8.GetBytes(presented);
        var b = Encoding.UTF8.GetBytes(expected);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }

    private async Task<ImportJobDoc?> ReadAsync(string jobId, CancellationToken ct)
    {
        try
        {
            return await Jobs.ReadItemAsync<ImportJobDoc>(jobId, new PartitionKey(jobId),
                cancellationToken: ct);
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    private Task ReplaceAsync(ImportJobDoc job, CancellationToken ct) =>
        Jobs.ReplaceItemAsync(job, job.Id, new PartitionKey(job.Id), cancellationToken: ct);

    private async Task<int> RunningCountAsync(string ownerId, CancellationToken ct)
    {
        var query = new QueryDefinition(
                "SELECT VALUE COUNT(1) FROM c WHERE c.ownerId = @o AND c.stage IN " +
                "('queued', 'fetching', 'reading', 'matching')")
            .WithParameter("@o", ownerId);
        using var feed = Jobs.GetItemQueryIterator<int>(query);
        return feed.HasMoreResults ? (await feed.ReadNextAsync(ct)).FirstOrDefault() : 0;
    }

    private static ObjectResult Bad(string code) =>
        new(new { error = code }) { StatusCode = StatusCodes.Status400BadRequest };

    private static ObjectResult TooMany(string code) =>
        new(new { error = code }) { StatusCode = StatusCodes.Status429TooManyRequests };
}

public static class ImportProjection
{
    /// The token is absent by construction, not by remembering to remove it.
    public static ImportJobView ToView(ImportJobDoc job) => new(
        job.Id, job.Source.Kind, job.Source.Host, job.Stage, job.CreatedAt,
        job.Result, job.Error);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `~/.dotnet/dotnet test api/Ebrostay.Api.Tests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api && git commit -m "feat(api): the four import endpoints"
```

---

## Task 5: The stub extractor, and end-to-end proof of the spine

The pipeline does not exist. This is what makes the spine demoable, and it is what the Playwright fixtures will be recorded from.

**Files:**
- Create: `infra/stub-extractor.mjs`

**Interfaces:**
- Consumes: the queue message shape from Task 2, the callback endpoint from Task 4.
- Produces: a runnable stub. No code depends on it.

- [ ] **Step 1: Write the stub**

Create `infra/stub-extractor.mjs`:

```js
// A stand-in for the extraction pipeline that does not exist yet (ADR-033).
//
// It honours exactly the contract a real one must: dequeue, report stages,
// POST a result with the per-job token. It holds no Cosmos credential and
// knows nothing about PropertyDoc — which is the point of the contract.
//
//   node infra/stub-extractor.mjs
//
// Env: IMPORTS_CONNECTION (defaults to the Azurite dev shortcut).

import { QueueClient } from "@azure/storage-queue";

const CONNECTION = process.env.IMPORTS_CONNECTION ?? "UseDevelopmentStorage=true";
const QUEUE = "import-jobs";
const STEP_MS = Number(process.env.STUB_STEP_MS ?? 1500);

// Representative of an Idealista let, per README §10.5: 20 fields filled,
// 14 needing the owner. No English anywhere — the callback DTO has no member
// for it, so anything we sent would be discarded.
const FIXTURE = {
  listing: {
    address: "Calle de Bilbao, 12",
    postcode: "50004",
    areaEs: "Centro",
    name: "Piso luminoso en el Centro",
    type: "apartment",
    sizeM2: 78,
    bedrooms: 2,
    bathrooms: 1,
    floorNumber: 3,
    energyRating: "D",
    copyEs:
      "Piso exterior muy luminoso en pleno centro de Zaragoza, reformado en 2023.\n\n" +
      "A cinco minutos andando del tranvía y del mercado central.",
    detailsEs: "Calefacción central. Ascensor. Cocina office equipada.",
    bedsEs: "Un dormitorio con cama de 150 y otro con dos camas de 90.",
    amenities: ["wifi", "heating", "washingMachine", "elevator", "airConditioning"],
    petsAllowed: false,
    smokingAllowed: false,
  },
  pricing: {
    priceNumber: 950,
    depositAmount: 950,
    billsPolicy: "excluded",
    minStayMonths: 1,
  },
  imported: [
    "address", "postcode", "area", "name", "type", "sizeM2", "bedrooms",
    "bathrooms", "floorNumber", "energyRating", "copy", "details", "beds",
    "amenities", "petsAllowed", "smokingAllowed", "price", "depositAmount",
    "billsPolicy", "minStayMonths",
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function report(job, body) {
  const res = await fetch(job.callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Import-Token": job.callbackToken },
    body: JSON.stringify(body),
  });
  console.log(`  → ${body.stage}: ${res.status}`);
  return res.status;
}

async function handle(job) {
  console.log(`job ${job.jobId} (${job.source.host})`);
  for (const stage of ["fetching", "reading", "matching"]) {
    await sleep(STEP_MS);
    await report(job, { stage });
  }
  await sleep(STEP_MS);
  // Flip to exercise the failure path:
  //   await report(job, { stage: "failed", error: { code: "login_wall" } });
  await report(job, { stage: "done", result: FIXTURE });
}

const queue = new QueueClient(CONNECTION, QUEUE);
await queue.createIfNotExists();
console.log(`stub extractor watching ${QUEUE}…`);

for (;;) {
  const { receivedMessageItems } = await queue.receiveMessages({
    numberOfMessages: 4,
    visibilityTimeout: 120,
  });
  for (const m of receivedMessageItems) {
    try {
      await handle(JSON.parse(m.messageText));
      await queue.deleteMessage(m.messageId, m.popReceipt);
    } catch (e) {
      console.error("  ✗", e.message);
    }
  }
  if (receivedMessageItems.length === 0) await sleep(2000);
}
```

- [ ] **Step 2: Add the dependency**

Run:

```bash
cd infra && npm install @azure/storage-queue
```

- [ ] **Step 3: Prove the spine end to end**

With the local stack up (`4280` SWA, `3000` Next, `7071` Functions, Azurite on `10000`, Cosmos emulator on `8081`), start the stub in one terminal:

```bash
node infra/stub-extractor.mjs
```

Then, signed in at `http://localhost:4280`, run this in the browser console and confirm the stage walks `queued → fetching → reading → matching → done` and the final body carries `result.imported` with 20 keys:

```js
const { jobId } = await (await fetch("/api/import", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://www.idealista.com/inmueble/107294518/" }),
})).json();
for (let i = 0; i < 15; i++) {
  const job = await (await fetch(`/api/import/${jobId}`)).json();
  console.log(job.stage, job.result?.imported?.length ?? "");
  if (["done", "failed", "cancelled"].includes(job.stage)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
```

Then confirm each of these by hand and record the result in the commit message:

1. `POST /api/import` with `{"url":"https://www.milanuncios.com/x"}` → `400 unsupported_host`.
2. `POST /api/import/<id>/callback` with no `X-Import-Token` → `404`.
3. The same callback replayed after `done` → `409 job_finished`.
4. `GET /api/import/<someone-else's-id>` while signed in as another owner → `404`.

- [ ] **Step 4: Commit**

```bash
git add infra && git commit -m "test(infra): stub extractor for the import spine"
```

---

## Task 6: `app/lib/import.ts` — the client's pure logic

**Files:**
- Create: `app/lib/import.ts`
- Create: `app/lib/import.test.ts`

**Interfaces:**
- Consumes: `HostListing`, `HostPricing` from `@/lib/api`; `paragraphDoc` from `@/lib/rich-text`.
- Produces: `IMPORT_SOURCES`, `matchSource(url) → string | null`, `IMPORT_KEYS`, `type ImportKey`, `mergeImport(...)`, `clearMark(imported, key)`, `stageLine(stage, elapsedMs) → StageLine`, `POLL_MS`, `pollDelay(elapsedMs)`, `POLL_CEILING_MS`.

- [ ] **Step 1: Write the failing tests**

Create `app/lib/import.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  IMPORT_KEYS,
  clearMark,
  matchSource,
  mergeImport,
  pollDelay,
  stageLine,
} from "./import";
import { blankListing, blankPricing } from "./wizard";
import type { ImportResult } from "./api";

const result = (over: Partial<ImportResult> = {}): ImportResult => ({
  listing: { name: "Piso en el Centro", sizeM2: 78, bedrooms: 2 },
  pricing: { priceNumber: 950 },
  imported: ["name", "sizeM2", "bedrooms", "price"],
  ...over,
});

describe("matchSource", () => {
  it("recognises the six", () => {
    expect(matchSource("https://www.idealista.com/inmueble/1/")).toBe("idealista");
    expect(matchSource("https://www.airbnb.co.uk/rooms/1")).toBe("airbnb");
    expect(matchSource("https://booking.com/hotel/es/x")).toBe("booking");
  });

  it("refuses anything else", () => {
    expect(matchSource("https://www.milanuncios.com/x")).toBeNull();
    expect(matchSource("https://airbnb.evil.com/x")).toBeNull();
    expect(matchSource("https://evilidealista.com/x")).toBeNull();
    expect(matchSource("not a url")).toBeNull();
  });
});

describe("mergeImport", () => {
  it("fills untouched fields", () => {
    const { listing, imported } = mergeImport(
      blankListing(), blankPricing(), result(), new Set());
    expect(listing.name).toBe("Piso en el Centro");
    expect(imported).toContain("name");
  });

  it("leaves a touched field alone and does not mark it", () => {
    const typed = { ...blankListing(), name: "Mi piso" };
    const { listing, imported } = mergeImport(
      typed, blankPricing(), result(), new Set(["name"]));
    expect(listing.name).toBe("Mi piso");
    expect(imported).not.toContain("name");
    // …and the rest still lands.
    expect(listing.sizeM2).toBe(78);
    expect(imported).toContain("sizeM2");
  });

  it("returns only the keys it actually applied", () => {
    const { imported } = mergeImport(
      blankListing(), blankPricing(),
      // Claims a key it sent no value for.
      result({ imported: ["name", "energyRating"] }), new Set());
    expect(imported).toEqual(["name"]);
  });

  it("wraps the Spanish description into a document", () => {
    const { listing } = mergeImport(
      blankListing(), blankPricing(),
      result({ listing: { copyEs: "Piso luminoso." }, imported: ["copy"] }),
      new Set());
    expect(listing.copy?.es?.type).toBe("doc");
    expect(listing.copy?.en).toBeNull();
  });
});

describe("clearMark", () => {
  it("removes one key and leaves its neighbours", () => {
    expect(clearMark(["name", "price", "sizeM2"], "price")).toEqual(["name", "sizeM2"]);
  });

  it("is a no-op for a key that is not marked", () => {
    expect(clearMark(["name"], "price")).toEqual(["name"]);
  });
});

describe("stageLine", () => {
  it("uses the reported stage when there is one", () => {
    expect(stageLine("matching", 500).key).toBe("matching");
  });

  it("advances on elapsed time while the pipeline only says queued", () => {
    expect(stageLine("queued", 0).key).toBe("fetching");
    expect(stageLine("queued", 30_000).key).toBe("matching");
  });

  it("never walks backwards", () => {
    // Reported 'matching' beats a young clock.
    expect(stageLine("matching", 0).key).toBe("matching");
  });
});

describe("pollDelay", () => {
  it("is 2s early and 5s after the first minute", () => {
    expect(pollDelay(1_000)).toBe(2_000);
    expect(pollDelay(90_000)).toBe(5_000);
  });
});

describe("IMPORT_KEYS", () => {
  it("holds 26 keys and no duplicates", () => {
    expect(new Set(IMPORT_KEYS).size).toBe(IMPORT_KEYS.length);
    expect(IMPORT_KEYS.length).toBe(26);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd app && npx vitest run lib/import.test.ts`
Expected: FAIL — cannot resolve `./import`.

- [ ] **Step 3: Add the API types**

In `app/lib/api.ts`, add near the other host types:

```ts
/** A partial listing from an import. Every field is optional and absent means
 *  "the portal did not say" — which is NOT "the portal said empty". There is
 *  no `en` anywhere: the English is never imported (§10.5), and the server's
 *  DTO has no member for it either. */
export type ImportListingPatch = {
  address?: string; postcode?: string; cadastralRef?: string;
  lat?: number; lng?: number; areaEs?: string;
  copyEs?: string; detailsEs?: string; bedsEs?: string;
  name?: string; type?: string;
  guests?: number; bedrooms?: number; bathrooms?: number; sizeM2?: number;
  floorNumber?: number; energyRating?: string;
  amenities?: string[];
  petsAllowed?: boolean; smokingAllowed?: boolean;
  couplesAllowed?: boolean; selfCheckin?: boolean;
};

export type ImportPricingPatch = {
  priceNumber?: number; depositAmount?: number; billsPolicy?: string;
  utilitiesCapEur?: number; minStayMonths?: number;
};

/** `imported` is authoritative — never derived from "which fields are set". */
export type ImportResult = {
  listing: ImportListingPatch;
  pricing: ImportPricingPatch;
  imported: string[];
};

export type ImportStage =
  | "queued" | "fetching" | "reading" | "matching"
  | "done" | "failed" | "cancelled";

export type ImportJobView = {
  jobId: string;
  kind: string;
  host: string;
  stage: ImportStage;
  createdAt: string;
  result: ImportResult | null;
  error: { code: string } | null;
};

export const startImport = (url: string) =>
  post<{ jobId: string; stage: ImportStage }>("/import", { url });

export const fetchImportJob = (jobId: string) =>
  get<ImportJobView>(`/import/${encodeURIComponent(jobId)}`);

export const cancelImport = (jobId: string) =>
  del<void>(`/import/${encodeURIComponent(jobId)}`);
```

If `del` does not already exist beside `get`/`post`/`put`, add `async function del<T>(path: string) { return write<T>("DELETE", path, undefined); }` and let `write` skip the body when it is `undefined`.

- [ ] **Step 4: Write `app/lib/import.ts`**

```ts
import type { HostListing, HostPricing, ImportResult, ImportStage } from "@/lib/api";
import { paragraphDoc } from "@/lib/rich-text";

// ============================================================
// "Start faster" — the AI-assisted import (ADR-033).
//
// Nothing here draws anything and nothing here knows about React. Two screens,
// a banner and twenty-odd marks all state things about the same job, and
// computed at each site they would be twenty chances to disagree.
// ============================================================

/** The closed list, named on screen BEFORE anything is pasted. An unmapped
 *  page yields values in the wrong fields, and a wrong field the owner did not
 *  notice is worse than an empty form — so the answer arrives before the
 *  effort does. Mirrors `ImportSources.All` in api/Models/ImportModels.cs. */
export const IMPORT_SOURCES = [
  { key: "idealista", domains: ["idealista.com"], anyTld: false },
  { key: "fotocasa", domains: ["fotocasa.es"], anyTld: false },
  { key: "habitaclia", domains: ["habitaclia.com"], anyTld: false },
  { key: "pisos", domains: ["pisos.com"], anyTld: false },
  { key: "airbnb", domains: ["airbnb"], anyTld: true },
  { key: "booking", domains: ["booking"], anyTld: true },
] as const;

export type SourceKey = (typeof IMPORT_SOURCES)[number]["key"];

/** The pasted URL → one of the six, or null. The server re-checks this; the
 *  client's copy exists to light the pill and enable the button, not to be
 *  believed. */
export function matchSource(url: string): SourceKey | null {
  let host: string;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }

  for (const source of IMPORT_SOURCES) {
    for (const domain of source.domains) {
      if (source.anyTld) {
        // Airbnb and Booking answer on dozens of TLDs. Match the brand label,
        // then require everything after it to be TLD-shaped — so airbnb.co.uk
        // matches and airbnb.evil.com does not.
        const labels = host.split(".");
        const at = labels.indexOf(domain);
        if (at >= 0 && at < labels.length - 1 &&
            labels.slice(at + 1).every((l) => l.length > 0 && l.length <= 3))
          return source.key;
      } else if (host === domain || host.endsWith(`.${domain}`)) {
        return source.key;
      }
    }
  }
  return null;
}

/** Every field an import may claim. Mirrors `ImportKeys.All` in
 *  api/Models/ImportModels.cs — a drift is an unmarked field or a rejected
 *  callback, never a harmless difference.
 *
 *  Grouped controls carry ONE key for the group (`type`, `energyRating`,
 *  `amenities`, `billsPolicy`, `minStayMonths`, each house rule): a portal's
 *  feature list mapping to nine of fifteen amenities is still one answer to
 *  one question, so any toggle clears the group. */
export const IMPORT_KEYS = [
  "address", "postcode", "pin", "area", "cadastralRef",
  "name", "type", "sizeM2", "bedrooms", "bathrooms", "guests",
  "floorNumber", "energyRating",
  "copy", "details", "beds",
  "amenities",
  "price", "billsPolicy", "utilitiesCapEur", "depositAmount", "minStayMonths",
  "petsAllowed", "smokingAllowed", "couplesAllowed", "selfCheckin",
] as const;

export type ImportKey = (typeof IMPORT_KEYS)[number];

/** Which step an owner goes to in order to look at a marked field — the same
 *  job `STEP_OF` does for blockers. `nearby` is absent on purpose: nothing an
 *  advert publishes belongs in a measured walking time. */
export const IMPORT_STEP_OF: Record<ImportKey, string> = {
  address: "address", postcode: "address", pin: "address", area: "address",
  cadastralRef: "address",
  name: "basics", type: "basics", sizeM2: "basics", bedrooms: "basics",
  bathrooms: "basics", guests: "basics", floorNumber: "basics",
  energyRating: "basics",
  copy: "description", details: "description", beds: "description",
  amenities: "amenities",
  price: "pricing", billsPolicy: "pricing", utilitiesCapEur: "pricing",
  depositAmount: "pricing", minStayMonths: "pricing",
  petsAllowed: "rules", smokingAllowed: "rules", couplesAllowed: "rules",
  selfCheckin: "rules",
};

/** An arriving import MERGES, never overwrites: only fields the owner has not
 *  touched may be filled. This is the whole reason "Start filling it in
 *  meanwhile" is safe to offer.
 *
 *  `touched` is the set of keys the owner has typed into since the read
 *  started. The returned `imported` is what was ACTUALLY applied — a key the
 *  payload claimed but sent no value for is not a mark. */
export function mergeImport(
  listing: HostListing,
  pricing: HostPricing,
  result: ImportResult,
  touched: ReadonlySet<string>,
): { listing: HostListing; pricing: HostPricing; imported: ImportKey[] } {
  const claimed = new Set(result.imported);
  const applied: ImportKey[] = [];
  const next = { ...listing };
  const nextPricing = { ...pricing };
  const l = result.listing;
  const p = result.pricing;

  const take = <T,>(key: ImportKey, value: T | undefined, apply: (v: T) => void) => {
    if (value === undefined || !claimed.has(key) || touched.has(key)) return;
    apply(value);
    applied.push(key);
  };

  take("address", l.address, (v) => (next.address = v));
  take("postcode", l.postcode, (v) => (next.postcode = v));
  take("cadastralRef", l.cadastralRef, (v) => (next.cadastralRef = v));
  take("area", l.areaEs, (v) => (next.area = { es: v, en: null }));
  if (l.lat !== undefined && l.lng !== undefined)
    take("pin", l.lat, (v) => { next.lat = v; next.lng = l.lng!; });

  take("name", l.name, (v) => (next.name = v));
  take("type", l.type, (v) => (next.type = v));
  take("sizeM2", l.sizeM2, (v) => (next.sizeM2 = v));
  take("bedrooms", l.bedrooms, (v) => (next.bedrooms = v));
  take("bathrooms", l.bathrooms, (v) => (next.bathrooms = v));
  take("guests", l.guests, (v) => (next.guests = v));
  take("floorNumber", l.floorNumber, (v) => (next.floorNumber = v));
  take("energyRating", l.energyRating, (v) => (next.energyRating = v));

  // The Spanish only, always. `copyEnApproved` is untouched: there is no
  // English to approve, and an approval gate the owner clicks through is
  // worse than no English (§10.5).
  take("copy", l.copyEs, (v) => (next.copy = { es: paragraphDoc(v), en: null }));
  take("details", l.detailsEs, (v) => (next.details = { es: v, en: null }));
  take("beds", l.bedsEs, (v) => (next.beds = { es: v, en: null }));

  take("amenities", l.amenities, (v) => (next.amenities = v));
  take("petsAllowed", l.petsAllowed, (v) => (next.petsAllowed = v));
  take("smokingAllowed", l.smokingAllowed, (v) => (next.smokingAllowed = v));
  take("couplesAllowed", l.couplesAllowed, (v) => (next.couplesAllowed = v));
  take("selfCheckin", l.selfCheckin, (v) => (next.selfCheckin = v));

  // Carried across UNCHANGED. Portals quote a calendar month and this field is
  // thirty days flat (ADR-023); multiplying by 30/31 would be a guess about the
  // owner's intent landing in the one field with contract consequences, and the
  // step-6 banner says so instead.
  take("price", p.priceNumber, (v) => (nextPricing.priceNumber = v));
  take("depositAmount", p.depositAmount, (v) => (nextPricing.depositAmount = v));
  take("billsPolicy", p.billsPolicy, (v) => (nextPricing.billsPolicy = v));
  take("utilitiesCapEur", p.utilitiesCapEur, (v) => (nextPricing.utilitiesCapEur = v));
  take("minStayMonths", p.minStayMonths, (v) => (nextPricing.minStayMonths = v));

  next.imported = applied;
  return { listing: next, pricing: nextPricing, imported: applied };
}

/** Editing a field clears its mark PERMANENTLY. Do not re-mark on undo: the
 *  marks that remain are exactly the values nobody has looked at, and that is
 *  the whole trust mechanism. */
export const clearMark = (imported: string[] | null, key: string): string[] =>
  (imported ?? []).filter((k) => k !== key);

const STAGE_KEYS = ["fetching", "reading", "matching"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export type StageLine = { key: StageKey };

/** The three status lines. A pipeline may report only done/failed on day one,
 *  so the clock advances them and a real reported stage always overrides the
 *  estimate. No percentage anywhere: the duration is not knowable, and a bar
 *  that stalls at 80% is a lie with a number on it. */
export function stageLine(stage: ImportStage, elapsedMs: number): StageLine {
  const byClock = elapsedMs < 12_000 ? 0 : elapsedMs < 26_000 ? 1 : 2;
  const reported = STAGE_KEYS.indexOf(stage as StageKey);
  return { key: STAGE_KEYS[Math.max(byClock, reported)] };
}

export const POLL_MS = 2_000;
export const POLL_CEILING_MS = 5 * 60_000;

/** 2s while the wait is still short, 5s after the first minute. A read that is
 *  going to take fifty seconds does not need twenty-five polls in its last
 *  half. */
export const pollDelay = (elapsedMs: number) => (elapsedMs < 60_000 ? POLL_MS : 5_000);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd app && npx vitest run lib/import.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app && git commit -m "feat(app): lib/import.ts — sources, merge, marks and stage lines"
```

---

## Task 7: The start and reading screens

**Files:**
- Create: `app/components/host/new/import/StartScreen.tsx`
- Create: `app/components/host/new/import/ReadingScreen.tsx`
- Modify: `app/messages/es.json`, `app/messages/en.json`
- Modify: `app/app/[locale]/host/new/page.tsx`

**Interfaces:**
- Consumes: `matchSource`, `stageLine`, `pollDelay`, `POLL_CEILING_MS` from `@/lib/import`; `startImport`, `fetchImportJob`, `cancelImport` from `@/lib/api`.
- Produces: `<StartScreen onStart={(url) => void} onBlank={() => void} error={string | null} busy={boolean} />` and `<ReadingScreen host={string} stage={ImportStage} elapsedMs={number} onMeanwhile={() => void} onStop={() => void} />`.

- [ ] **Step 1: Add every string, in both locales**

In `app/messages/en.json`, under `host`, add an `import` object:

```json
"import": {
  "title": "Is this home already listed somewhere?",
  "pasteHead": "Paste the link",
  "pasteEyebrow": "SIX SITES WE READ",
  "urlLabel": "Link to your listing",
  "urlPlaceholder": "https://www.idealista.com/inmueble/…",
  "read": "Read this listing",
  "statusEmpty": "Paste a link from one of the six sites above.",
  "statusKnown": "{source} recognised. We read the whole page, not the search card.",
  "statusUnknown": "We do not read {host}. Use one of the six above, or the document route below.",
  "docHead": "Or a document",
  "docSoon": "Coming soon",
  "docBody": "PDF, JPG or PNG, up to ten pages: an agency dossier, a listing sheet, or photos of a printed one.",
  "blankProse": "Nothing listed anywhere? That is fine — the form takes about twelve minutes.",
  "blank": "Start with a blank form",
  "neverEyebrow": "WHAT AN IMPORT NEVER FILLS",
  "neverPhotosHead": "Photos",
  "neverPhotos": "A portal re-compresses and downscales everything it publishes, and many stamp a watermark on it. Your cover photo runs full-bleed on a search card, so a re-encoded crop with a logo in the corner cannot do that job. Yours to upload at full size, in your order.",
  "neverAvailabilityHead": "Availability",
  "neverAvailability": "No portal publishes real dates, and a month wrongly closed costs a booking you never hear about. Closed by hand, by you.",
  "neverPaperworkHead": "Paperwork",
  "neverPaperwork": "The five documents are checked against you, not against an advert. Nobody else's PDF can stand in for your NIE.",
  "readingTitle": "Reading your listing",
  "stageFetching": "Opening the listing…",
  "stageReading": "Reading the listing…",
  "stageMatching": "Matching it to your fields…",
  "honest": "This can take up to a minute. We read the whole listing rather than its summary — we would rather be slow than put the wrong number in your price.",
  "meanwhile": "Start filling it in meanwhile",
  "stop": "Stop reading",
  "errorUnsupportedHost": "We do not read that site. Use one of the six above.",
  "errorBadUrl": "That does not look like a link. Copy it from your browser's address bar.",
  "errorTooManyImports": "You already have two reads running. Wait for one to finish.",
  "errorDailyImportLimit": "That is as many reads as we run in a day. Try again tomorrow, or fill the form in yourself.",
  "errorLoginWall": "That listing asks us to sign in, so we cannot read it.",
  "errorNotFound": "That listing is not there any more.",
  "errorWithdrawn": "That listing has been withdrawn.",
  "errorUnreadable": "We could not make sense of that page.",
  "errorTimeout": "This is taking longer than it should. Start with a blank form and we will not keep you waiting.",
  "errorPipelineError": "Something went wrong on our side while reading it."
}
```

In `app/messages/es.json`, the same keys — and **keep the reasons whole**, they are the copy doing the trust work:

```json
"import": {
  "title": "¿Ya está esta vivienda anunciada en algún sitio?",
  "pasteHead": "Pega el enlace",
  "pasteEyebrow": "SEIS SITIOS QUE LEEMOS",
  "urlLabel": "Enlace a tu anuncio",
  "urlPlaceholder": "https://www.idealista.com/inmueble/…",
  "read": "Leer este anuncio",
  "statusEmpty": "Pega un enlace de uno de los seis sitios de arriba.",
  "statusKnown": "{source} reconocido. Leemos la página entera, no la ficha del buscador.",
  "statusUnknown": "No leemos {host}. Usa uno de los seis de arriba, o la vía del documento de abajo.",
  "docHead": "O un documento",
  "docSoon": "Muy pronto",
  "docBody": "PDF, JPG o PNG, hasta diez páginas: un dosier de agencia, una ficha del inmueble, o fotos de una impresa.",
  "blankProse": "¿No está anunciada en ningún sitio? No pasa nada: el formulario lleva unos doce minutos.",
  "blank": "Empezar con el formulario en blanco",
  "neverEyebrow": "LO QUE UNA IMPORTACIÓN NUNCA RELLENA",
  "neverPhotosHead": "Las fotos",
  "neverPhotos": "Un portal recomprime y reduce todo lo que publica, y muchos le estampan una marca de agua. Tu foto de portada se ve a sangre en la tarjeta del buscador, así que un recorte recodificado con un logotipo en la esquina no puede hacer ese trabajo. Son tuyas: súbelas a tamaño completo y en tu orden.",
  "neverAvailabilityHead": "La disponibilidad",
  "neverAvailability": "Ningún portal publica fechas reales, y un mes cerrado por error cuesta una reserva de la que nunca te enteras. Se cierra a mano, y la cierras tú.",
  "neverPaperworkHead": "La documentación",
  "neverPaperwork": "Los cinco documentos se comprueban contra ti, no contra un anuncio. El PDF de otra persona no puede hacer de tu NIE.",
  "readingTitle": "Leyendo tu anuncio",
  "stageFetching": "Abriendo el anuncio…",
  "stageReading": "Leyendo el anuncio…",
  "stageMatching": "Emparejándolo con tus campos…",
  "honest": "Esto puede tardar hasta un minuto. Leemos el anuncio entero y no su resumen: preferimos ser lentos a poner un número equivocado en tu precio.",
  "meanwhile": "Empezar a rellenarlo mientras tanto",
  "stop": "Dejar de leer",
  "errorUnsupportedHost": "No leemos ese sitio. Usa uno de los seis de arriba.",
  "errorBadUrl": "Eso no parece un enlace. Cópialo de la barra de direcciones de tu navegador.",
  "errorTooManyImports": "Ya tienes dos lecturas en marcha. Espera a que termine una.",
  "errorDailyImportLimit": "Son todas las lecturas que hacemos en un día. Inténtalo mañana, o rellena el formulario tú.",
  "errorLoginWall": "Ese anuncio nos pide iniciar sesión, así que no podemos leerlo.",
  "errorNotFound": "Ese anuncio ya no está.",
  "errorWithdrawn": "Ese anuncio se ha retirado.",
  "errorUnreadable": "No hemos podido entender esa página.",
  "errorTimeout": "Esto está tardando más de lo que debería. Empieza con el formulario en blanco y no te hacemos esperar.",
  "errorPipelineError": "Algo ha fallado por nuestra parte al leerlo."
}
```

- [ ] **Step 2: Write the start screen**

Create `app/components/host/new/import/StartScreen.tsx`. It is a client component, `max-w-[860px]` centred, `flex flex-col gap-[22px]`, **no rail and no step card** — this is not step 0 of 9 and a progress header would lie about it.

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { IMPORT_SOURCES, matchSource } from "@/lib/import";

// The offer (§10.1). Not a banner on step 1: the import is a fork in the road,
// and a dismissible banner above the address field would make the blank path
// the default and the import an afterthought — backwards for the majority case.

export function StartScreen({
  onStart, onBlank, error, busy,
}: {
  onStart: (url: string) => void;
  onBlank: () => void;
  error: string | null;
  busy: boolean;
}) {
  const t = useTranslations("host.import");
  const [url, setUrl] = useState("");

  const source = matchSource(url);
  const typed = url.trim().length > 0;
  let host = "";
  try { host = new URL(url.trim()).hostname.replace(/^www\./, ""); } catch { host = ""; }

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-[22px]">
      <h1 className="font-display text-[34px] font-bold text-ink">{t("title")}</h1>

      <section className="rounded-card border border-line bg-surface p-[22px_24px] shadow-card">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-[19px] font-bold text-ink">{t("pasteHead")}</h2>
          <span className="font-mono text-[10.5px] tracking-[.1em] text-muted">
            {t("pasteEyebrow")}
          </span>
        </div>

        <ul className="mt-4 flex flex-wrap gap-2">
          {IMPORT_SOURCES.map((s) => {
            const lit = source === s.key;
            return (
              <li
                key={s.key}
                className={
                  "rounded-full border px-[13px] py-[6px] text-[12.5px] " +
                  (lit
                    ? "border-river-deep bg-river-soft font-semibold text-ink"
                    : "border-line bg-surface-2 text-body")
                }
              >
                {s.key[0].toUpperCase() + s.key.slice(1)}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex flex-wrap gap-3">
          <label className="sr-only" htmlFor="import-url">{t("urlLabel")}</label>
          <input
            id="import-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("urlPlaceholder")}
            className="min-w-[320px] flex-1 rounded-control border border-line bg-surface px-3 py-2 font-mono text-[13.5px] text-ink"
          />
          <button
            type="button"
            // GENUINELY disabled, attribute and all — an actionable-looking
            // button that silently does nothing is worse than a plainly dead
            // one (§10.1).
            disabled={!source || busy}
            aria-disabled={!source || busy}
            onClick={() => source && onStart(url.trim())}
            className="rounded-control bg-brand px-4 py-2 text-[13.5px] font-semibold text-on-brand disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
          >
            {t("read")}
          </button>
        </div>

        <p className="mt-2 text-[12.5px] text-ink" aria-live="polite">
          {error
            ? error
            : !typed
              ? <span className="text-muted">{t("statusEmpty")}</span>
              : source
                ? t("statusKnown", { source: source[0].toUpperCase() + source.slice(1) })
                : t("statusUnknown", { host: host || url.trim() })}
        </p>
      </section>

      <section
        className="rounded-card border border-line bg-surface p-[22px_24px] opacity-70 shadow-card"
        aria-labelledby="import-doc-head"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="import-doc-head" className="font-display text-[19px] font-bold text-ink">
            {t("docHead")}
          </h2>
          <span className="rounded-full bg-surface-2 px-[10px] py-[3px] font-mono text-[10.5px] tracking-[.1em] text-body">
            {t("docSoon")}
          </span>
        </div>
        <p className="mt-2 text-[12.5px] text-body">{t("docBody")}</p>
        {/* No drop, dragover or change handler is attached AT ALL, so a dragged
            file cannot be silently swallowed (ADR-033 Decision 9). */}
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="mt-4 w-full cursor-not-allowed rounded-control border border-dashed border-line-strong bg-surface-2 py-6 text-[13px] text-muted"
        >
          {t("docSoon")}
        </button>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-2 px-[22px] py-4">
        <p className="text-[13px] text-body">{t("blankProse")}</p>
        <button
          type="button"
          onClick={onBlank}
          className="rounded-control border border-line-strong px-4 py-2 text-[13.5px] font-semibold text-ink"
        >
          {t("blank")}
        </button>
      </div>

      <section>
        <p className="font-mono text-[10.5px] tracking-[.12em] text-muted">
          {t("neverEyebrow")}
        </p>
        <hr className="mt-2 border-line" />
        <dl className="mt-3 flex flex-col gap-3">
          {(["Photos", "Availability", "Paperwork"] as const).map((k) => (
            <div key={k}>
              <dt className="text-[13px] font-semibold text-ink">{t(`never${k}Head`)}</dt>
              <dd className="text-[12.5px] text-body">{t(`never${k}`)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
```

Check the utility class names against `app/app/[locale]/globals.css` and an existing host component before running — this project's Tailwind v4 theme defines its own tokens (`text-ink`, `bg-surface-2`, `border-line-strong`, `rounded-card`, `shadow-card`, `font-display`), and any name that does not exist silently renders nothing.

- [ ] **Step 3: Write the reading screen**

Create `app/components/host/new/import/ReadingScreen.tsx`: `max-w-[560px]` centred, one card, the source echoed as a river-filled mono pill, a 19px river ring spinner with `border-top-color: transparent` and `animation: none` under `prefers-reduced-motion`, an `aria-live="polite"` status line from `stageLine`, the honest paragraph, then **Start filling it in meanwhile** as the prominent action and a quiet *Stop reading* beside it.

```tsx
"use client";

import { useTranslations } from "next-intl";
import { stageLine } from "@/lib/import";
import type { ImportStage } from "@/lib/api";

// The wait, designed as a wait (§10.2). No progress bar: the duration is not
// knowable and a bar that stalls at 80% is a lie with a number on it.

export function ReadingScreen({
  host, stage, elapsedMs, onMeanwhile, onStop,
}: {
  host: string;
  stage: ImportStage;
  elapsedMs: number;
  onMeanwhile: () => void;
  onStop: () => void;
}) {
  const t = useTranslations("host.import");
  const line = stageLine(stage, elapsedMs);
  const label = { fetching: t("stageFetching"), reading: t("stageReading"),
                  matching: t("stageMatching") }[line.key];

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <section className="rounded-card border border-line bg-surface p-[22px_24px] shadow-card">
        <h1 className="font-display text-[19px] font-bold text-ink">{t("readingTitle")}</h1>

        <p className="mt-3 inline-block max-w-full truncate rounded-full bg-river-soft px-3 py-1 font-mono text-[12.5px] font-semibold text-ink">
          {host}
        </p>

        <div className="mt-4 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-[19px] w-[19px] shrink-0 animate-spin rounded-full border-2 border-river-deep border-t-transparent motion-reduce:animate-none"
          />
          <p className="text-[13px] text-ink" aria-live="polite">{label}</p>
        </div>

        <p className="mt-4 text-[12.5px] text-body">{t("honest")}</p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onMeanwhile}
            className="rounded-control bg-brand px-4 py-2 text-[13.5px] font-semibold text-on-brand"
          >
            {t("meanwhile")}
          </button>
          <button
            type="button"
            onClick={onStop}
            className="text-[12.5px] text-muted underline underline-offset-2"
          >
            {t("stop")}
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Wire the phases into the wizard page**

In `app/app/[locale]/host/new/page.tsx`:

- add `const [phase, setPhase] = useState<"start" | "reading" | "wizard">(...)`, defaulting to `"wizard"` when `?id=` is present (a resumed draft never sees the offer) and `"start"` otherwise;
- read `?import=<jobId>` from `useSearchParams` on mount and resume the poll from it — this is what makes the read survive a reload before the draft exists;
- on `onStart`, call `startImport(url)`, push `?import=<jobId>` with `router.replace`, and set `phase = "reading"`;
- poll with `fetchImportJob(jobId)` on a `setTimeout` chain using `pollDelay(elapsed)`, stopping at `POLL_CEILING_MS`, on any terminal stage, or on unmount;
- on `onMeanwhile`, set `phase = "wizard"` and **leave the poll running**;
- on `onStop`, call `cancelImport(jobId)` and set `phase = "wizard"`;
- map `ApiError.code` to the `errorX` message keys for the start screen's status line, and `job.error.code` likewise.

- [ ] **Step 5: Verify in the browser**

With the stack up and the stub extractor running, open `http://localhost:4280/es/host/new`, then confirm each of:

1. The read button is `disabled` until a URL from the six is typed — check the attribute in the inspector, not just the styling.
2. Typing an Idealista URL lifts the Idealista pill to river and changes the status line.
3. Typing `https://www.milanuncios.com/x` names the host back in the status line and leaves the button disabled.
4. Pressing **Read this listing** shows the reading card, and the status line steps through the three phrases.
5. Pressing **Start filling it in meanwhile** lands on step 1 with the read still running.
6. Reloading the page mid-read (the URL carries `?import=`) resumes the reading screen.
7. **Stop reading** returns to a blank step 1 and the job goes `cancelled`.
8. The same at 375px, 768px and 1280px, in light and dark.

Then measure contrast on the status line, the pills and the "coming soon" chip. **4.5:1 for text, 3:1 for graphics** — compute the ratio in the console with alpha compositing rather than eyeballing it; `--river-deep` measures 3.69:1 on `--river-soft` and is not a text colour there.

- [ ] **Step 6: Commit**

```bash
git add app && git commit -m "feat(app): the start and reading screens for AI-assisted import"
```

---

## Task 8: Marks and banners inside the wizard

**Files:**
- Create: `app/components/host/new/import/ImportMark.tsx`
- Create: `app/components/host/new/import/ImportBanner.tsx`
- Modify: `app/app/[locale]/host/new/page.tsx`
- Modify: `app/messages/es.json`, `app/messages/en.json`

**Interfaces:**
- Consumes: `mergeImport`, `clearMark`, `IMPORT_STEP_OF`, `IMPORT_KEYS` from `@/lib/import`; `StepKey` from `@/lib/wizard`.
- Produces: `<ImportMark />` and `<ImportBanner step={StepKey} source={string} imported={string[]} justLanded={boolean} />`.

- [ ] **Step 1: Add the banner strings**

Add to the `host.import` object in **both** message files. English:

```json
"markLabel": "Filled from your listing — edit it and the mark clears",
"bannerFrom": "FROM {source}",
"bannerJustLanded": "JUST LANDED · {source}",
"bannerPolicy": "NOT IMPORTED · BY POLICY",
"bannerNothing": "NOTHING ON THIS STEP",
"bannerKey": "marks the fields we filled from {source}. Edit one and the mark clears.",
"bannerNothingLine": "{source} had nothing for this step — all of it is yours to answer.",
"bannerPricingCaution": "Portals quote a calendar month. This price is for thirty days — check it."
```

Spanish:

```json
"markLabel": "Rellenado desde tu anuncio: edítalo y la marca desaparece",
"bannerFrom": "DE {source}",
"bannerJustLanded": "ACABA DE LLEGAR · {source}",
"bannerPolicy": "NO IMPORTADO · POR NORMA",
"bannerNothing": "NADA EN ESTE PASO",
"bannerKey": "marca los campos que hemos rellenado desde {source}. Edita uno y la marca desaparece.",
"bannerNothingLine": "{source} no tenía nada para este paso: todo es tuyo por responder.",
"bannerPricingCaution": "Los portales anuncian un mes natural. Este precio es por treinta días: compruébalo."
```

- [ ] **Step 2: Write the mark**

Create `app/components/host/new/import/ImportMark.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";

// A GLYPH, not a label (§10.4). Twenty fields each captioned FROM YOUR LISTING
// was noise: the words repeat, they widen every label, and they compete with
// the label they annotate. As an icon it also gets to keep river — 3:1 is the
// bar for non-text, where the same colour would fail as 9px type.
//
// River, never green: green means YOURS in this product, and a value the
// machine proposed is not yours yet.

export function ImportMark() {
  const t = useTranslations("host.import");
  return (
    <svg
      role="img"
      aria-label={t("markLabel")}
      viewBox="0 0 16 16"
      width="13"
      height="13"
      className="inline-block shrink-0 align-[-1px] text-river-deep"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{t("markLabel")}</title>
      <path d="M8 2v7" />
      <path d="M5 6.5 8 9.5l3-3" />
      <path d="M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}
```

- [ ] **Step 3: Write the banner**

Create `app/components/host/new/import/ImportBanner.tsx`. Two lines at most, **no buttons and no numbers** — a count is a number the owner can see for themselves and a gap list is a second copy of the form in prose.

```tsx
"use client";

import { useTranslations } from "next-intl";
import { ImportMark } from "./ImportMark";
import { IMPORT_STEP_OF, type ImportKey } from "@/lib/import";
import type { StepKey } from "@/lib/wizard";

// The only change an import makes to the nine steps. No step's fields, order,
// validation or copy changes because an import happened.
//
// Variant is chosen by StepKey, NEVER by number: the design handoff's §10.3–10.5
// numbers predate the ninth step and are off by one past the first.

const POLICY_STEPS = new Set<StepKey>(["photos", "paperwork"]);

export function ImportBanner({
  step, source, imported, justLanded,
}: {
  step: StepKey;
  source: string;
  imported: string[];
  justLanded: boolean;
}) {
  const t = useTranslations("host.import");
  const named = source[0].toUpperCase() + source.slice(1);
  const policy = POLICY_STEPS.has(step);
  const touched = imported.some((k) => IMPORT_STEP_OF[k as ImportKey] === step);

  const eyebrow = policy
    ? t("bannerPolicy")
    : justLanded
      ? t("bannerJustLanded", { source: named })
      : touched
        ? t("bannerFrom", { source: named })
        : t("bannerNothing");

  return (
    <aside className="mb-4 flex gap-3 rounded-card border border-river bg-river-soft px-4 py-3">
      <span aria-hidden="true" className="mt-[6px] h-2 w-2 shrink-0 rounded-full bg-river-deep" />
      <div>
        <p className="font-mono text-[10.5px] font-semibold tracking-[.1em] text-ink">
          {eyebrow}
        </p>
        <p className="mt-1 text-[12.5px] text-body">
          {policy ? (
            step === "photos" ? t("neverPhotos") : t("neverPaperwork")
          ) : touched ? (
            <>
              <ImportMark /> {t("bannerKey", { source: named })}
            </>
          ) : (
            t("bannerNothingLine", { source: named })
          )}
        </p>
        {step === "pricing" && touched && (
          <p className="mt-1 text-[12.5px] text-body">{t("bannerPricingCaution")}</p>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Wire the merge and the marks into the wizard page**

In `app/app/[locale]/host/new/page.tsx`:

- keep a `touchedRef = useRef(new Set<string>())`; every field change adds its `ImportKey` and calls `setListing((l) => ({ ...l, imported: clearMark(l.imported, key) }))`. **Do not re-mark on undo.**
- when the poll returns `stage === "done"`, call `mergeImport(listing, pricing, job.result, touchedRef.current)`, apply the returned `listing`/`pricing`, set `importSource` from `job.host`, and set `justLanded` true if `phase` was already `"wizard"`.
- render `<ImportBanner … />` above the step body whenever `listing.importSource` is set.
- render `<ImportMark />` inside the relevant field label of each step component that the key vocabulary covers. Grouped controls (kind of home, energy, amenities, bills, shortest stay, each house rule) get **one** mark on the group label.

- [ ] **Step 5: Verify in the browser**

With the stub running, complete a read and then confirm:

1. Roughly twenty fields carry the glyph; the banner names Idealista and shows the glyph once as its key.
2. Typing one character in the name field clears **that** glyph and no other. Undoing does not bring it back.
3. Toggling one amenity clears the group's mark.
4. Photos and Paperwork show `NOT IMPORTED · BY POLICY` with the reason.
5. Nearby shows `NOTHING ON THIS STEP`.
6. Pricing shows the calendar-month caution, and the price is exactly what the fixture sent — **not** multiplied by 30/31.
7. Reload mid-wizard: the glyphs are still there (Task 1's persisted `imported`).
8. Contrast on the banner and glyph measured numerically — the glyph is non-text so 3:1 applies, but the banner's body copy is text and needs 4.5:1. `--river-deep` and `--muted` are **not** text colours on a river panel; text there goes `--ink` or `--body-text`.

- [ ] **Step 6: Commit**

```bash
git add app && git commit -m "feat(app): import marks and the per-step banner"
```

---

## Task 9: End-to-end coverage and the documentation flip

**Files:**
- Modify: `app/e2e/` (fixtures and a case for the new screens)
- Modify: `docs/spec-v2/05-decision-log.md`
- Modify: `docs/spec-v2/04-api.md` (the endpoint list)

**Interfaces:**
- Consumes: everything above.
- Produces: green `npm run test:e2e`, and an ADR whose status matches reality.

- [ ] **Step 1: Add the fixtures**

The e2e suite serves `/api/*` from recorded fixtures. Add:

- `POST /api/import` → `202 {"jobId":"imp_test","stage":"queued"}`
- `GET /api/import/imp_test` → `200` with `stage: "done"` and the same fixture body the stub extractor sends, so one payload is the source of truth for both.

- [ ] **Step 2: Add the page case**

`/{locale}/host/new` is already enumerated by the route guard test. Add a case that starts on `phase === "start"` and asserts no uncaught exception and no console error, in **both** `es` and `en`.

- [ ] **Step 3: Run the whole suite**

Run each and confirm green:

```bash
~/.dotnet/dotnet test api/Ebrostay.Api.Tests
```

```bash
cd app && npx tsc --noEmit && npm test && npm run build && npm run test:e2e
```

- [ ] **Step 4: Flip the documentation**

In `docs/spec-v2/05-decision-log.md`, change ADR-033's status from `🔜 **not built**` to `✅ **built** 2026-XX-XX`, and note anything decided during implementation. In `docs/spec-v2/04-api.md`, add the four endpoints to the endpoint list with their error codes.

- [ ] **Step 5: Commit**

```bash
git add app docs && git commit -m "test(app): e2e coverage for the import screens; ADR-033 built"
```

---

## Self-review

**Spec coverage.** Job document → Task 2. Four endpoints → Task 4. Queue and wakeup → Task 3. Callback policy enforcement (key vocabulary, English unrepresentable, clamps) → Tasks 2 and 4. Key vocabulary in both languages → Tasks 1, 2 and 6. Client merge, marks, stage lines, poll timing → Task 6. `imported` persistence → Task 1. Reload survival via `?import=` and `importJobId` → Task 7. Start screen including the disabled Card B → Task 7. Reading screen and the escape hatch → Task 7. Banners and marks → Task 8. Rate limits → Tasks 3 and 4. Failure handling → the error codes are closed in Task 2, mapped to copy in Task 7; the failure *layout* is OD-8 and deliberately out of scope. Infrastructure → Task 3. Testing → every task, plus Task 9.

**One gap accepted deliberately:** the spec mentions `importJobId` on the draft as the post-draft half of reload survival. Task 7 implements the pre-draft half (`?import=` in the URL), which covers the whole reading window, since the draft is only created on leaving step 1 and by then the read has almost always landed. Adding a field to `PropertyDoc` for the residual case is not worth a second schema change; if a real owner hits it, it is a one-line addition.

**Type consistency.** `ImportResult`, `ImportListingPatch` and `ImportPricingPatch` carry the same member names in C# (PascalCase) and TypeScript (camelCase), which the Cosmos and `JsonSerializerDefaults.Web` serializers already bridge everywhere else in this codebase. `ImportKeys.All` (C#) and `IMPORT_KEYS` (TS) hold the same 26 strings — Task 6's test asserts the count, and a mismatch surfaces as a rejected callback in Task 5's manual run.
