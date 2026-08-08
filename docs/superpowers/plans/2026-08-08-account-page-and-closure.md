# Account Page and Account Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/account` — the page `AuthMenu.tsx:79` has always linked to and which has never existed — plus an owner-initiated account-closure request that disables writes and moves the owner's listings.

**Architecture:** A nullable `DeletionRequestedAt` timestamp on the profile document is the whole state. A new guard `RequireWritableAsync` refuses write endpoints while it is set; read endpoints keep the existing guard, so an owner can still see what is about to close. Requesting closure fans out over the owner's listings and rewrites each status by a pure, idempotent map; cancelling reverses only the listings that actually moved.

**Tech Stack:** C# Azure Functions (.NET 9 isolated) + Cosmos DB; Next.js App Router static export, TypeScript, Tailwind v4, next-intl; xunit for API tests, vitest for frontend units, Playwright for e2e.

**Design spec:** `docs/superpowers/specs/2026-08-08-account-page-design.md` (committed as `c5b43a8`).

## Global Constraints

- **No new dependencies.** The project is deliberately dependency-light; nothing here needs one.
- **Bilingual.** Every user-facing string needs both ES and EN in `app/messages/es.json` and `app/messages/en.json`. A string in one file only is a bug.
- **Roles never come from Cosmos.** `ProfileDoc` carries no role field (§3.2). Authorization inputs come from `x-ms-client-principal` only.
- **The caller's id comes from the principal, never the body** (§3.4).
- **`closed` is a public-visible state.** Any filter that means "the public can see this" must accept `published` and `closed`.
- **Owners never set `closed` themselves.** Do not add it to `OwnerStatuses` in `api/Models/HostWrites.cs`. Only the closure endpoint writes it.
- **Error bodies are `{ "error": "<snake_case_code>" }`**, matching `account_deactivated` in `api/Services/ProfileService.cs`.
- Run API tests with `dotnet test api/Ebrostay.Api.Tests`, frontend units with `npm test` (from `app/`), e2e with `npx playwright test` (from `app/`).

---

### Task 1: Profile field and the writable guard

**Files:**
- Modify: `api/Models/ProfileDoc.cs`
- Modify: `api/Services/ProfileService.cs:47-62`
- Modify: `api/Functions/MeFunction.cs:21-32`
- Test: `api/Ebrostay.Api.Tests/AccountClosureTests.cs` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `ProfileDoc.DeletionRequestedAt` (`string?`, ISO-8601, null = no request); `MeResponse.DeletionRequestedAt` (`string?`, final constructor parameter); `ProfileService.RequireWritableAsync(ClientPrincipal?)` returning `(ProfileDoc? profile, IActionResult? error)`.

- [ ] **Step 1: Write the failing test**

Create `api/Ebrostay.Api.Tests/AccountClosureTests.cs`:

```csharp
using Ebrostay.Api.Models;
using Xunit;

namespace Ebrostay.Api.Tests;

// The closure flag is a timestamp, not a boolean: it is the audit record the
// admin users tab reads as well as the gate every write endpoint checks.
public class ProfileClosureTests
{
    [Fact]
    public void A_fresh_profile_has_no_closure_request()
    {
        var doc = new ProfileDoc { Id = "u1" };
        Assert.Null(doc.DeletionRequestedAt);
    }

    [Fact]
    public void A_closure_request_is_an_iso_timestamp()
    {
        var doc = new ProfileDoc { Id = "u1", DeletionRequestedAt = "2026-08-08T10:00:00.0000000+00:00" };
        Assert.True(DateTimeOffset.TryParse(doc.DeletionRequestedAt, out _));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test api/Ebrostay.Api.Tests --filter ProfileClosureTests`
Expected: FAIL — compile error, `ProfileDoc` has no `DeletionRequestedAt`.

- [ ] **Step 3: Add the field**

In `api/Models/ProfileDoc.cs`, add to `ProfileDoc` after `IsDeactivated`:

```csharp
    /// Owner-initiated account closure (design 2026-08-08). Null = no request.
    /// A timestamp rather than a bool: it is both the gate every write endpoint
    /// checks and the audit record the admin users tab shows, so the admin can
    /// see how long a request has waited.
    ///
    /// Deliberately NOT `IsDeactivated`. Deactivation is done TO you by an
    /// admin and locks you out; a closure request is made BY you and must
    /// still let you reach your own account page to cancel it.
    public string? DeletionRequestedAt { get; set; }
```

And add the final parameter to `MeResponse`:

```csharp
public record MeResponse(
    bool Authenticated,
    string? UserId,
    string? Name,
    string? Provider,
    string[] Roles,
    bool IsAdmin,
    bool IsDeactivated,
    string? DeletionRequestedAt);
```

- [ ] **Step 4: Fix the two `MeResponse` call sites**

In `api/Functions/MeFunction.cs`, the anonymous branch (line 21-22) becomes:

```csharp
            return new OkObjectResult(
                new MeResponse(false, null, null, null, ["anonymous"], false, false, null));
```

and the authenticated branch gains a final argument:

```csharp
            IsDeactivated: profile.IsDeactivated,
            DeletionRequestedAt: profile.DeletionRequestedAt));
```

- [ ] **Step 5: Run test to verify it passes**

Run: `dotnet test api/Ebrostay.Api.Tests --filter ProfileClosureTests`
Expected: PASS (2 tests).

- [ ] **Step 6: Add the writable guard**

In `api/Services/ProfileService.cs`, directly after `RequireActiveAsync`:

```csharp
    // The guard every WRITE endpoint calls, in place of RequireActiveAsync.
    //
    // The difference between "your account is closing" and "you are locked
    // out": a closing account can still READ — its owner needs to see the
    // portfolio that is about to close, and to reach the page that cancels
    // the request — but cannot create or edit anything.
    //
    // Layered on RequireActiveAsync so the §3.7 deactivation refusal still
    // runs first: a deactivated account is refused as deactivated, whatever
    // else is true of it.
    public async Task<(ProfileDoc? profile, IActionResult? error)> RequireWritableAsync(
        ClientPrincipal? principal)
    {
        var (profile, error) = await RequireActiveAsync(principal);
        if (error is not null) return (null, error);

        if (profile!.DeletionRequestedAt is not null)
            return (null, new ObjectResult(new { error = "deletion_requested" })
            {
                StatusCode = StatusCodes.Status403Forbidden,
            });

        return (profile, null);
    }
```

- [ ] **Step 7: Build to verify**

Run: `dotnet build api/Ebrostay.Api.csproj`
Expected: build succeeds, no warnings about unmatched `MeResponse` arity.

- [ ] **Step 8: Commit**

```bash
git add api/Models/ProfileDoc.cs api/Services/ProfileService.cs api/Functions/MeFunction.cs api/Ebrostay.Api.Tests/AccountClosureTests.cs
git commit -m "feat(account): the flag a closing account carries"
```

---

### Task 2: The transition map

**Files:**
- Create: `api/Models/AccountModels.cs`
- Test: `api/Ebrostay.Api.Tests/AccountClosureTests.cs` (append)

**Interfaces:**
- Consumes: nothing.
- Produces: `AccountClosure.OnRequest(string status)` → `string?` (the new status, or null to leave untouched); `AccountClosure.OnCancel(string status)` → `string?`; `record AccountClosureState(string? DeletionRequestedAt)`.

Kept pure and separate from Cosmos, exactly like `AdminValidation` in `api/Models/AdminModels.cs:164`, so the whole rule can be tested without a database.

> **Deviation from the design spec.** §9 of the spec assigns the transition map to *vitest*. That was wrong: the map runs server-side only — no frontend code decides a listing's status — so a TypeScript copy would be a second statement of the same rule with nothing to keep it honest. It is tested here in xunit instead. The spec's other three test rows are unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `api/Ebrostay.Api.Tests/AccountClosureTests.cs`:

```csharp
// The §4 transition table of the 2026-08-08 design, one test per state.
// Null means "leave this listing alone" — and that is the load-bearing half:
// restoring only what actually moved is what stops a `draft` reaching
// `paused`, from where an owner could reopen to `published` a listing no
// reviewer ever saw (02-data-model.md:300).
public class AccountClosureMapTests
{
    [Fact]
    public void Request_closes_a_published_listing()
        => Assert.Equal("closed", AccountClosure.OnRequest("published"));

    [Fact]
    public void Request_withdraws_a_listing_awaiting_review()
        => Assert.Equal("draft", AccountClosure.OnRequest("pending_review"));

    [Theory]
    [InlineData("paused")]
    [InlineData("draft")]
    [InlineData("rejected")]
    public void Request_leaves_every_non_public_state_alone(string status)
        => Assert.Null(AccountClosure.OnRequest(status));

    [Fact]
    public void Cancel_parks_a_closed_listing_in_paused()
        => Assert.Equal("paused", AccountClosure.OnCancel("closed"));

    [Theory]
    [InlineData("published")]
    [InlineData("pending_review")]
    [InlineData("paused")]
    [InlineData("draft")]
    [InlineData("rejected")]
    public void Cancel_touches_nothing_that_did_not_move(string status)
        => Assert.Null(AccountClosure.OnCancel(status));

    // Re-running a half-finished fan-out must be safe: the writes are not
    // atomic across documents, so this is the property the endpoint relies on.
    [Fact]
    public void Request_is_idempotent()
    {
        var once = AccountClosure.OnRequest("published");
        Assert.Equal("closed", once);
        Assert.Null(AccountClosure.OnRequest(once!));
    }

    [Fact]
    public void Cancel_is_idempotent()
    {
        var once = AccountClosure.OnCancel("closed");
        Assert.Equal("paused", once);
        Assert.Null(AccountClosure.OnCancel(once!));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test api/Ebrostay.Api.Tests --filter AccountClosureMapTests`
Expected: FAIL — compile error, `AccountClosure` does not exist.

- [ ] **Step 3: Write the implementation**

Create `api/Models/AccountModels.cs`:

```csharp
namespace Ebrostay.Api.Models;

/// The request body is empty — the account being closed is always the caller's
/// own, read from `x-ms-client-principal` (§3.4). The type exists so the
/// endpoint's response has a shape.
public record AccountClosureState(string? DeletionRequestedAt);

/// What an owner's closure request does to each of their listings, and what
/// cancelling undoes. Pure and Cosmos-free, like `AdminValidation`, so the
/// whole rule is testable without a database.
///
/// Both directions return `null` for "leave this listing untouched", which is
/// also what makes them idempotent: re-applying the map to an already-moved
/// listing is a no-op, so a fan-out that failed halfway is safe to repeat.
public static class AccountClosure
{
    /// `published` is the only state the public can see, so it is the only one
    /// that has to change. `pending_review` is withdrawn to `draft` so no
    /// reviewer can approve a home for a departing owner. `paused`, `draft`
    /// and `rejected` are already invisible — moving `paused` to `closed`
    /// would make it MORE visible, not less.
    public static string? OnRequest(string status) => status switch
    {
        "published" => "closed",
        "pending_review" => "draft",
        _ => null,
    };

    /// Only what moved, moves back — and it lands in `paused`, not
    /// `published`: nothing returns to search without the owner reopening it
    /// deliberately.
    ///
    /// A withdrawn `pending_review` listing is NOT resubmitted here. It stays
    /// a draft and the owner resubmits, because submitting runs the
    /// completeness checks (`HostValidation.CheckStatus`) that this endpoint
    /// has no business bypassing.
    public static string? OnCancel(string status) => status switch
    {
        "closed" => "paused",
        _ => null,
    };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test api/Ebrostay.Api.Tests --filter AccountClosureMapTests`
Expected: PASS (13 tests, counting the `Theory` cases).

- [ ] **Step 5: Commit**

```bash
git add api/Models/AccountModels.cs api/Ebrostay.Api.Tests/AccountClosureTests.cs
git commit -m "feat(account): what a closure does to each listing"
```

---

### Task 3: The closure endpoints

**Files:**
- Create: `api/Functions/AccountFunctions.cs`
- Test: `api/Ebrostay.Api.Tests/AccountClosureTests.cs` (append)

**Interfaces:**
- Consumes: `ProfileDoc.DeletionRequestedAt` and `ProfileService.RequireActiveAsync` (Task 1); `AccountClosure.OnRequest` / `OnCancel` (Task 2).
- Produces: `POST /api/account/closure` and `DELETE /api/account/closure`, both returning `200` with `AccountClosureState`.

Note the guard choice: these two endpoints call `RequireActiveAsync`, **not** `RequireWritableAsync`. Cancelling is a write that a closing account must be able to make — guarding it with `RequireWritableAsync` would make the request unreversible by the person who made it.

- [ ] **Step 1: Write the failing test**

Append to `api/Ebrostay.Api.Tests/AccountClosureTests.cs`:

```csharp
// The fan-out is a loop over the owner's listings applying the Task 2 map.
// These tests pin the loop's decisions without a Cosmos account: given a set
// of listings, which ones get written and to what.
public class AccountClosureFanOutTests
{
    private static PropertyDoc Listing(string id, string status) =>
        new() { Id = id, HostId = "u1", Status = status };

    [Fact]
    public void Request_writes_only_the_listings_that_change()
    {
        PropertyDoc[] listings =
        [
            Listing("a", "published"),
            Listing("b", "pending_review"),
            Listing("c", "paused"),
            Listing("d", "draft"),
        ];

        var writes = AccountClosure.PlanRequest(listings).ToArray();

        Assert.Equal(2, writes.Length);
        Assert.Equal(("a", "closed"), (writes[0].Id, writes[0].Status));
        Assert.Equal(("b", "draft"), (writes[1].Id, writes[1].Status));
    }

    [Fact]
    public void Cancel_writes_only_the_closed_listings()
    {
        PropertyDoc[] listings =
        [
            Listing("a", "closed"),
            Listing("b", "draft"),
            Listing("c", "paused"),
        ];

        var writes = AccountClosure.PlanCancel(listings).ToArray();

        Assert.Single(writes);
        Assert.Equal(("a", "paused"), (writes[0].Id, writes[0].Status));
    }

    [Fact]
    public void Re_running_a_finished_request_writes_nothing()
    {
        PropertyDoc[] listings = [Listing("a", "closed"), Listing("b", "draft")];
        Assert.Empty(AccountClosure.PlanRequest(listings));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test api/Ebrostay.Api.Tests --filter AccountClosureFanOutTests`
Expected: FAIL — `AccountClosure` has no `PlanRequest` / `PlanCancel`.

- [ ] **Step 3: Add the planners**

Append to `AccountClosure` in `api/Models/AccountModels.cs`:

```csharp
    /// The listings a closure request must write, and their new status. Kept
    /// separate from the endpoint so the fan-out's decisions are testable
    /// without a Cosmos account — the endpoint only loops and saves.
    public static IEnumerable<PropertyDoc> PlanRequest(IEnumerable<PropertyDoc> listings) =>
        Plan(listings, OnRequest);

    public static IEnumerable<PropertyDoc> PlanCancel(IEnumerable<PropertyDoc> listings) =>
        Plan(listings, OnCancel);

    private static IEnumerable<PropertyDoc> Plan(
        IEnumerable<PropertyDoc> listings, Func<string, string?> map)
    {
        foreach (var doc in listings)
        {
            var next = map(doc.Status);
            if (next is null) continue;
            doc.Status = next;
            yield return doc;
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test api/Ebrostay.Api.Tests --filter AccountClosureFanOutTests`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the endpoints**

Create `api/Functions/AccountFunctions.cs`:

```csharp
using System.Net;
using Ebrostay.Api.Models;
using Ebrostay.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace Ebrostay.Api.Functions;

// Owner-initiated account closure (design 2026-08-08). The admin's half —
// deciding how to proceed, and any hard delete — is deliberately unbuilt and
// deferred to its own ADR: §3.7 keeps records and never deletes them.
public class AccountFunctions(
    Database database,
    ProfileService profiles,
    ILogger<AccountFunctions> logger)
{
    private Container Profiles => database.GetContainer("profiles");
    private Container Properties => database.GetContainer("properties");

    [Function("AccountClosureRequest")]
    public Task<IActionResult> Request(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "account/closure")]
        HttpRequest req) => Apply(req, requesting: true);

    // DELETE, not another POST: cancelling removes the request, and the same
    // resource answering both verbs is why neither needs a body.
    [Function("AccountClosureCancel")]
    public Task<IActionResult> Cancel(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "account/closure")]
        HttpRequest req) => Apply(req, requesting: false);

    // RequireActiveAsync, NOT RequireWritableAsync: cancelling is a write that
    // a closing account must be able to make. Guarding it with the writable
    // check would let someone request a closure they could never reverse.
    private async Task<IActionResult> Apply(HttpRequest req, bool requesting)
    {
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
        if (error is not null) return error;

        List<PropertyDoc> listings;
        try
        {
            listings = [];
            var query = new QueryDefinition("SELECT * FROM c WHERE c.hostId = @host")
                .WithParameter("@host", profile!.Id);
            using var feed = Properties.GetItemQueryIterator<PropertyDoc>(query);
            while (feed.HasMoreResults) listings.AddRange(await feed.ReadNextAsync());
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error loading listings for {Host}", profile!.Id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        var writes = requesting
            ? AccountClosure.PlanRequest(listings)
            : AccountClosure.PlanCancel(listings);

        // Listing-first, profile-last. The two are not one transaction, so the
        // order decides what a crash leaves behind: with the flag written last,
        // an interrupted run leaves an account that is still open with some
        // listings already moved — recoverable by pressing the button again,
        // because the map is idempotent. The other order would leave an account
        // that is closing with listings still public, which nothing retries.
        foreach (var doc in writes)
        {
            try
            {
                await Properties.ReplaceItemAsync(doc, doc.Id, new PartitionKey(doc.Id));
            }
            catch (CosmosException ex)
            {
                logger.LogError(ex, "Cosmos error closing listing {Id}", doc.Id);
                return new StatusCodeResult(StatusCodes.Status502BadGateway);
            }
        }

        profile!.DeletionRequestedAt = requesting
            ? DateTimeOffset.UtcNow.ToString("o")
            : null;

        try
        {
            await Profiles.ReplaceItemAsync(profile, profile.Id, new PartitionKey(profile.Id));
        }
        catch (CosmosException ex)
        {
            logger.LogError(ex, "Cosmos error writing closure flag for {Id}", profile.Id);
            return new StatusCodeResult(StatusCodes.Status502BadGateway);
        }

        return new OkObjectResult(new AccountClosureState(profile.DeletionRequestedAt));
    }
}
```

- [ ] **Step 6: Build and run the full API suite**

Run: `dotnet test api/Ebrostay.Api.Tests`
Expected: PASS — every previously passing test still passes.

- [ ] **Step 7: Commit**

```bash
git add api/Functions/AccountFunctions.cs api/Models/AccountModels.cs api/Ebrostay.Api.Tests/AccountClosureTests.cs
git commit -m "feat(account): request a closure, and take it back"
```

---

### Task 4: Refuse writes while an account is closing

**Files:**
- Modify: `api/Functions/HostFunctions.cs` lines 114, 219, 571, 612, 725, 783, 825
- Modify: `api/Functions/ImportFunctions.cs` lines 45, 243
- Test: `api/Ebrostay.Api.Tests/AccountClosureTests.cs` (append)

**Interfaces:**
- Consumes: `ProfileService.RequireWritableAsync` (Task 1).
- Produces: nothing new.

These are exactly the nine authenticated **write** call sites. Every other `RequireActiveAsync` call is a read and must be left alone — `HostFunctions:45` (GET host/properties), `HostFunctions:193` (GET host/properties/{id}), `ImportFunctions:146` (GET import/{jobId}), `NearbyFunctions:72` and `NearbyFunctions:98` (both GET). Changing a read is the mistake this task can make: it would blind an owner to the portfolio they are trying to close.

- [ ] **Step 1: Write the failing test**

Append to `api/Ebrostay.Api.Tests/AccountClosureTests.cs`:

```csharp
// The guard's contract. The endpoints themselves need a Cosmos account to
// test, but which guard each one calls is a fact about the source, and this
// is the negative-test matrix's entry for a closing account (spec §3.5).
public class WritableGuardTests
{
    private static string Source(string file) =>
        File.ReadAllText(Path.Combine("..", "..", "..", "..", "Functions", file));

    [Theory]
    [InlineData("HostFunctions.cs", 7)]
    [InlineData("ImportFunctions.cs", 2)]
    public void Every_write_endpoint_uses_the_writable_guard(string file, int expected)
    {
        var writes = Source(file).Split("RequireWritableAsync").Length - 1;
        Assert.Equal(expected, writes);
    }

    [Fact]
    public void Read_endpoints_keep_the_active_guard()
    {
        // GET host/properties and GET host/properties/{id} — an owner must
        // still see the portfolio that is closing.
        var reads = Source("HostFunctions.cs").Split("RequireActiveAsync").Length - 1;
        Assert.Equal(2, reads);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test api/Ebrostay.Api.Tests --filter WritableGuardTests`
Expected: FAIL — 0 occurrences of `RequireWritableAsync`, expected 7 and 2.

- [ ] **Step 3: Swap the nine write call sites**

In `api/Functions/HostFunctions.cs`, change `RequireActiveAsync` to `RequireWritableAsync` on lines **114, 219, 571, 612, 725, 783, 825** only. Each line reads:

```csharp
        var (profile, error) = await profiles.RequireActiveAsync(principal);
```

and becomes:

```csharp
        var (profile, error) = await profiles.RequireWritableAsync(principal);
```

Leave lines 45 and 193 unchanged.

In `api/Functions/ImportFunctions.cs`, change lines **45** and **243**. Each reads:

```csharp
        var (profile, error) = await profiles.RequireActiveAsync(ClientPrincipal.Parse(req));
```

and becomes:

```csharp
        var (profile, error) = await profiles.RequireWritableAsync(ClientPrincipal.Parse(req));
```

Leave line 146 unchanged. Leave `NearbyFunctions.cs` entirely unchanged — both its guarded endpoints are GETs.

- [ ] **Step 4: Run test to verify it passes**

Run: `dotnet test api/Ebrostay.Api.Tests --filter WritableGuardTests`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full API suite**

Run: `dotnet test api/Ebrostay.Api.Tests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/Functions/HostFunctions.cs api/Functions/ImportFunctions.cs api/Ebrostay.Api.Tests/AccountClosureTests.cs
git commit -m "feat(account): a closing account stops writing"
```

---

### Task 5: The public can see a closed listing

**Files:**
- Modify: `api/Functions/PropertiesFunctions.cs:27-29` and `:89`
- Test: `api/Ebrostay.Api.Tests/AccountClosureTests.cs` (append)

**Interfaces:**
- Consumes: the `closed` status string (Task 2).
- Produces: `PublicStatus.IsPublic(string status)` → `bool`, the single predicate both read paths use.

This is the sharpest edge in the change. Two places decide "can the public see this", and changing one without the other either hides a `closed` listing from search or drops it into the owner-preview branch, where a stranger gets a 404 for a listing that should be visible. The fix is to give both paths one predicate so they cannot drift.

- [ ] **Step 1: Write the failing test**

Append to `api/Ebrostay.Api.Tests/AccountClosureTests.cs`:

```csharp
// One predicate, two call sites. A `closed` listing is still public — its
// owner is leaving, but a guest mid-stay should not watch the page vanish.
public class PublicStatusTests
{
    [Theory]
    [InlineData("published")]
    [InlineData("closed")]
    public void The_public_sees_these(string status)
        => Assert.True(PublicStatus.IsPublic(status));

    [Theory]
    [InlineData("draft")]
    [InlineData("pending_review")]
    [InlineData("rejected")]
    [InlineData("paused")]
    public void And_never_these(string status)
        => Assert.False(PublicStatus.IsPublic(status));
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test api/Ebrostay.Api.Tests --filter PublicStatusTests`
Expected: FAIL — `PublicStatus` does not exist.

- [ ] **Step 3: Write the predicate**

Append to `api/Models/AccountModels.cs`:

```csharp
/// "Can an anonymous visitor see this listing?" — asked by the public list and
/// the public detail, which is why it is one function and not two literals.
/// `closed` joined `published` with the 2026-08-08 closure design: the owner
/// is leaving, but a guest whose stay is running should not watch the page
/// disappear underneath them.
public static class PublicStatus
{
    public static readonly string[] Public = ["published", "closed"];

    public static bool IsPublic(string status) => Array.IndexOf(Public, status) >= 0;
}
```

- [ ] **Step 4: Use it in both read paths**

In `api/Functions/PropertiesFunctions.cs`, replace the list query (lines 27-29):

```csharp
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE ARRAY_CONTAINS(@statuses, c.status)")
            .WithParameter("@statuses", PublicStatus.Public);
```

and the detail check (line 89):

```csharp
            if (PublicStatus.IsPublic(doc.Status)) return new OkObjectResult(detail);
```

Add `using Ebrostay.Api.Models;` if the file does not already have it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `dotnet test api/Ebrostay.Api.Tests`
Expected: PASS, including the 6 new `PublicStatusTests` cases.

- [ ] **Step 6: Commit**

```bash
git add api/Functions/PropertiesFunctions.cs api/Models/AccountModels.cs api/Ebrostay.Api.Tests/AccountClosureTests.cs
git commit -m "feat(account): a closed home stays on the site"
```

---

### Task 6: The admin sees who is closing

**Files:**
- Modify: `api/Models/AdminModels.cs:141-149`
- Modify: `api/Functions/AdminFunctions.cs` (the `UsersList` projection)
- Modify: `app/lib/api.ts` (the `AdminUser` type)
- Modify: `app/app/[locale]/admin/users/page.tsx:131-137`
- Modify: `app/messages/es.json`, `app/messages/en.json`

**Interfaces:**
- Consumes: `ProfileDoc.DeletionRequestedAt` (Task 1).
- Produces: `AdminUser.DeletionRequestedAt` (`string?`), rendered as a state in the users tab.

- [ ] **Step 1: Add the field to the API record**

In `api/Models/AdminModels.cs`, add a final parameter to `AdminUser`:

```csharp
public record AdminUser(
    string Id,
    string Provider,
    string Name,
    string? CreatedAt,
    string? LastSeenAt,
    bool IsDeactivated,
    int ListingCount,
    int PublishedCount,
    /// Set when the user has asked to close their account (design
    /// 2026-08-08). No action is attached to it yet — the admin's half of the
    /// flow is deferred to its own ADR — so this is a signal to act on out of
    /// band, not a queue.
    string? DeletionRequestedAt);
```

- [ ] **Step 2: Populate it**

In `api/Functions/AdminFunctions.cs`, find the `new AdminUser(` projection inside `UsersList` and add `doc.DeletionRequestedAt` as the final argument.

- [ ] **Step 3: Build**

Run: `dotnet build api/Ebrostay.Api.csproj`
Expected: build succeeds.

- [ ] **Step 4: Mirror the type on the frontend**

In `app/lib/api.ts`, find the `AdminUser` type and add:

```typescript
  deletionRequestedAt: string | null;
```

- [ ] **Step 5: Add the strings**

In `app/messages/en.json`, under `admin.users`, add to the existing `col` object and alongside the other state strings:

```json
"closing": "Closing"
```

In `app/messages/es.json`, the same key:

```json
"closing": "Cerrando"
```

- [ ] **Step 6: Show it in the state column**

In `app/app/[locale]/admin/users/page.tsx`, in the cell rendering `col.state`, show the closing state ahead of the deactivated one — a closing account is the more recent, more actionable fact:

```tsx
{user.deletionRequestedAt
  ? t("closing")
  : user.isDeactivated
    ? t("deactivated")
    : t("active")}
```

Match the surrounding code's existing key names for `deactivated` and `active`; if they differ, keep theirs and change only the new branch.

- [ ] **Step 7: Run the frontend suite**

Run: `cd app && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/Models/AdminModels.cs api/Functions/AdminFunctions.cs app/lib/api.ts app/app/\[locale\]/admin/users/page.tsx app/messages/es.json app/messages/en.json
git commit -m "feat(admin): who has asked to leave"
```

---

### Task 7: The frontend client and the signed-in gate

**Files:**
- Modify: `app/lib/auth.ts` (the `Me` type and `ANON`)
- Modify: `app/lib/api.ts` (two new calls)
- Create: `app/components/account/RequireSignedIn.tsx`
- Modify: `app/messages/es.json`, `app/messages/en.json`

**Interfaces:**
- Consumes: `POST /api/account/closure`, `DELETE /api/account/closure` (Task 3); `MeResponse.DeletionRequestedAt` (Task 1).
- Produces: `Me.deletionRequestedAt` (`string | null`); `requestAccountClosure()` and `cancelAccountClosure()`, both `Promise<{ deletionRequestedAt: string | null }>`; `<RequireSignedIn>` wrapper component.

- [ ] **Step 1: Extend the `Me` type**

In `app/lib/auth.ts`, add to the `Me` type after `isDeactivated`:

```typescript
  deletionRequestedAt: string | null;
```

and to `ANON`:

```typescript
  deletionRequestedAt: null,
```

- [ ] **Step 2: Add the two client calls**

In `app/lib/api.ts`, append:

```typescript
// Account closure (design 2026-08-08). Both hit the same resource; the verb is
// the whole difference, so neither carries a body — the account being closed
// is always the caller's own, taken from the principal server-side.
export async function requestAccountClosure(): Promise<{
  deletionRequestedAt: string | null;
}> {
  return post("/api/account/closure", {});
}

export async function cancelAccountClosure(): Promise<{
  deletionRequestedAt: string | null;
}> {
  return del("/api/account/closure");
}
```

- [ ] **Step 3: Write the gate**

Create `app/components/account/RequireSignedIn.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/site/AuthProvider";
import { currentPath, signInPath } from "@/lib/auth";

// The gate on /account — the third sibling of `admin/RequireAdmin` and
// `host/RequireOwner`, and like both of them NOT the authorization boundary
// (§3.5): the functions refuse the data, this only hides a page.
//
// Simpler than either sibling, because there is no second answer to give. Any
// signed-in person may see their own account; a signed-out one is sent to sign
// in, keeping the locale and the destination so the round trip ends here.
export function RequireSignedIn({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me.authenticated) router.replace(signInPath(currentPath()));
  }, [loading, me.authenticated, router]);

  if (loading || !me.authenticated) {
    return (
      <main aria-busy="true" className="mx-auto max-w-2xl px-6 pt-6">
        <div className="skeleton h-40 rounded-(--radius-card)" />
      </main>
    );
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Run the frontend suite**

Run: `cd app && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/auth.ts app/lib/api.ts app/components/account/RequireSignedIn.tsx
git commit -m "feat(account): the client half of closing an account"
```

---

### Task 8: The account page

**Files:**
- Create: `app/app/[locale]/account/page.tsx`
- Modify: `app/public/staticwebapp.config.json:73-82`
- Modify: `app/messages/es.json`, `app/messages/en.json`

**Interfaces:**
- Consumes: `RequireSignedIn` (Task 7); `requestAccountClosure` / `cancelAccountClosure` (Task 7); `Me.deletionRequestedAt` (Task 7).
- Produces: the `/account` route.

**Visual design:** this task creates user-facing UI. Invoke the project's **frontend-design** skill (`.claude/skills/frontend-design/`) before writing the markup, per `CLAUDE.md`. The structure below is the requirement; the visual treatment is that skill's call. Follow the existing page shell conventions in `app/app/[locale]/admin/page.tsx`.

- [ ] **Step 1: Add the strings**

In `app/messages/en.json`, add a top-level `account` object:

```json
"account": {
  "title": "My account",
  "identity": "Signed in as",
  "provider": "Sign-in method",
  "dataTitle": "Your data",
  "purge": "Revoke the sign-in connection",
  "purgeHelp": "This disconnects your sign-in provider from Ebrostay. It does not delete your Ebrostay account — use the closure request below for that.",
  "support": "Contact us at",
  "closureTitle": "Close my account",
  "closureHelp": "Your homes will be taken out of search and you will not be able to create or edit anything. We will contact you before anything is removed.",
  "closureRequest": "Request closure",
  "closureConfirm": "Yes, request closure",
  "closureCancelConfirm": "Not now",
  "closingTitle": "Your account is closing",
  "closingSince": "Requested on",
  "closingHelp": "Creating and editing are disabled. Your published homes are closed to new requests. You can undo this at any time.",
  "closureUndo": "Cancel the closure request",
  "error": "Something went wrong. Please try again."
}
```

In `app/messages/es.json`, the same keys:

```json
"account": {
  "title": "Mi cuenta",
  "identity": "Sesión iniciada como",
  "provider": "Método de acceso",
  "dataTitle": "Tus datos",
  "purge": "Revocar la conexión de acceso",
  "purgeHelp": "Esto desconecta tu proveedor de acceso de Ebrostay. No elimina tu cuenta de Ebrostay — para eso, usa la solicitud de cierre de abajo.",
  "support": "Escríbenos a",
  "closureTitle": "Cerrar mi cuenta",
  "closureHelp": "Tus viviendas saldrán de la búsqueda y no podrás crear ni editar nada. Te contactaremos antes de eliminar nada.",
  "closureRequest": "Solicitar el cierre",
  "closureConfirm": "Sí, solicitar el cierre",
  "closureCancelConfirm": "Ahora no",
  "closingTitle": "Tu cuenta está en proceso de cierre",
  "closingSince": "Solicitado el",
  "closingHelp": "Crear y editar están desactivados. Tus viviendas publicadas están cerradas a nuevas solicitudes. Puedes deshacerlo cuando quieras.",
  "closureUndo": "Cancelar la solicitud de cierre",
  "error": "Algo ha fallado. Inténtalo de nuevo."
}
```

- [ ] **Step 2: Write the page**

Create `app/app/[locale]/account/page.tsx`. Required structure, three blocks:

```tsx
"use client";

// The page `AuthMenu` has linked to since the menu existed (§3.7). Three
// blocks, in the order a worried person reads them: who am I, what is
// happening to my account, and what can I do about my data.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/site/AuthProvider";
import { RequireSignedIn } from "@/components/account/RequireSignedIn";
import { requestAccountClosure, cancelAccountClosure } from "@/lib/api";
import { PROVIDER } from "@/lib/auth";

const SUPPORT_EMAIL = "info@ebrostay.com";

export default function AccountPage() {
  return (
    <RequireSignedIn>
      <AccountBody />
    </RequireSignedIn>
  );
}

function AccountBody() {
  const t = useTranslations("account");
  const { me, refresh } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Boolean(), not `!== null`: a fixture or an older API response that omits
  // the key entirely gives `undefined`, which `!== null` reads as "closing".
  const closing = Boolean(me.deletionRequestedAt);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
      await refresh();
      setConfirming(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-ink">{t("title")}</h1>

      {/* 1 — identity */}
      <section className="mt-8">
        <p className="text-sm text-muted">{t("identity")}</p>
        <p className="text-base text-ink">{me.name}</p>
        <p className="mt-2 text-sm text-muted">{t("provider")}</p>
        <p className="data text-sm text-body">{me.provider}</p>
      </section>

      {/* 2 — closure */}
      <section className="mt-10">
        {closing ? (
          <>
            <h2 className="text-lg font-semibold text-ink">{t("closingTitle")}</h2>
            <p className="mt-1 text-sm text-muted">
              {t("closingSince")} {me.deletionRequestedAt?.slice(0, 10)}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-body">{t("closingHelp")}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(cancelAccountClosure)}
            >
              {t("closureUndo")}
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-ink">{t("closureTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-body">{t("closureHelp")}</p>
            {confirming ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(requestAccountClosure)}
                >
                  {t("closureConfirm")}
                </button>
                <button type="button" onClick={() => setConfirming(false)}>
                  {t("closureCancelConfirm")}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)}>
                {t("closureRequest")}
              </button>
            )}
          </>
        )}
        {failed && <p className="mt-2 text-sm text-danger">{t("error")}</p>}
      </section>

      {/* 3 — data. The purge link is described as what it is: it revokes the
          sign-in connection and leaves the Ebrostay record alone. Calling it
          "delete my account" would be false, and this page is the one the
          privacy policy points at. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-ink">{t("dataTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-body">{t("purgeHelp")}</p>
        <a href={`/.auth/purge/${me.provider ?? PROVIDER}`}>{t("purge")}</a>
        <p className="mt-4 text-sm text-muted">
          {t("support")}{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Add `refresh` to the auth provider**

`AuthProvider` currently exposes `{ me, loading }` and nothing else, so the page above cannot re-read the flag after a write. Replace `app/components/site/AuthProvider.tsx` with:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ANON, fetchMe, type Me } from "@/lib/auth";

type AuthState = { me: Me; loading: boolean; refresh: () => Promise<void> };

const AuthContext = createContext<AuthState>({
  me: ANON,
  loading: true,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ me: Me; loading: boolean }>({
    me: ANON,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((me) => {
      if (!cancelled) setState({ me, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-read /api/me on demand. The account page needs it: closing an account
  // changes what every other surface should show, and a full reload to see it
  // would read as the page having failed.
  const refresh = useCallback(async () => {
    setState({ me: await fetchMe(), loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

- [ ] **Step 4: Close the route-rule gap**

In `app/public/staticwebapp.config.json`, the rules at lines 73-82 cover `/es/account/*` and `/en/account/*` — the wildcard only, so the exact path carries no rule. Add two more entries, matching what `/admin` got on 2026-08-08:

```json
{ "route": "/es/account", "allowedRoles": ["authenticated"] },
{ "route": "/en/account", "allowedRoles": ["authenticated"] }
```

- [ ] **Step 5: Build and check the route exists**

Run: `cd app && npm run build`
Expected: build succeeds and the output includes `/es/account` and `/en/account`.

- [ ] **Step 6: Run the frontend suite**

Run: `cd app && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/app/\[locale\]/account app/components/site/AuthProvider.tsx app/public/staticwebapp.config.json app/messages/es.json app/messages/en.json
git commit -m "feat(account): the page itself"
```

---

### Task 9: End-to-end

**Files:**
- Modify: `app/e2e/fixtures/me.json`
- Modify: `app/e2e/pages.spec.ts` (the `stubBackend` fixture table and the `ROUTES` table)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

The suite is one file, `app/e2e/pages.spec.ts`, built around `stubBackend(page)` — a single `page.route("**/*")` that serves `/api/*` from `app/e2e/fixtures/` and returns the paths it had no fixture for, so a new endpoint surfaces as an explicit gap. Routes are smoke-covered from a `ROUTES` table; tests that need a different identity override `**/api/me` per test. **Extend that harness. Do not add a second interception style in a new file.**

- [ ] **Step 1: Add the field to the shared identity fixture**

In `app/e2e/fixtures/me.json`, add:

```json
"deletionRequestedAt": null
```

Without it the key is `undefined` on every page, which is exactly the case Task 8's `Boolean()` guard exists for — but the fixture should still match what the API really returns.

- [ ] **Step 2: Add the route case and run it to watch it fail**

In the `ROUTES` table in `app/e2e/pages.spec.ts`, add alongside the other page entries:

```typescript
  { path: "/account", expect: { es: /mi cuenta/i, en: /my account/i } },
```

Run: `cd app && npx playwright test e2e/pages.spec.ts -g account`
Expected: FAIL — the route 404s, because the page does not exist until Task 8 is done. If Task 8 is already committed, this passes and you have the smoke coverage.

- [ ] **Step 3: Stub the closure endpoint**

In `stubBackend`, beside the other `/api/` fixture lines, add a stateful pair so the flow can be driven. Place it after the `/api/me` line:

```typescript
    // Closure is the one flow in this suite with state: the page reads the
    // flag back from /api/me after writing it, so the stub has to remember.
    if (path === "/api/account/closure") {
      const method = route.request().method();
      if (method === "POST") closureRequestedAt = "2026-08-08T10:00:00.0000000+00:00";
      if (method === "DELETE") closureRequestedAt = null;
      return json(JSON.stringify({ deletionRequestedAt: closureRequestedAt }));
    }
```

Declare `let closureRequestedAt: string | null = null;` at the top of `stubBackend`, and make the `/api/me` line reflect it:

```typescript
    if (path === "/api/me")
      return json(
        JSON.stringify({
          ...JSON.parse(fixture("me.json")),
          deletionRequestedAt: closureRequestedAt,
        }),
      );
```

- [ ] **Step 4: Add the flow test**

Append to `app/e2e/pages.spec.ts`, following the file's existing `test(...)` style:

```typescript
// The menu link that was a 404 for the whole of v2, and the flow behind it.
// Asserted in Spanish because the shared fixture renders the default locale.
test("closing an account asks first, reports it, and can be taken back", async ({
  page,
}) => {
  await stubBackend(page);
  await page.goto("/es/account");

  // The first click must not close anything — it opens the confirm step.
  await page.getByRole("button", { name: /solicitar el cierre/i }).click();
  const confirm = page.getByRole("button", { name: /sí, solicitar el cierre/i });
  await expect(confirm).toBeVisible();

  await confirm.click();
  await expect(
    page.getByRole("heading", { name: /tu cuenta está en proceso de cierre/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /cancelar la solicitud de cierre/i }).click();
  await expect(
    page.getByRole("button", { name: /solicitar el cierre/i }),
  ).toBeVisible();
});
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd app && npx playwright test e2e/pages.spec.ts`
Expected: PASS, including the new route case and the flow test, with `/account` no longer listed among the unstubbed paths.

- [ ] **Step 6: Run every suite**

Run, from the repo root:

```bash
dotnet test api/Ebrostay.Api.Tests
cd app && npm test && npx playwright test
```

Expected: all three suites PASS.

- [ ] **Step 7: Commit**

```bash
git add app/e2e/pages.spec.ts app/e2e/fixtures/me.json
git commit -m "test(account): the menu link is not a 404 any more"
```

---

## Follow-ups this plan deliberately leaves open

Recorded so they are not mistaken for oversights. All three were deferred with the product owner on 2026-08-08 and are written up in §2 of the design spec.

- **The admin's half.** A closure request appears in the users tab with no action attached. Hard delete reverses §3.7's "records are kept — never deleted" and needs its own ADR.
- **Invoices and payments blocking a closure.** v2 has no invoice or payment concept (ADR-016 dropped the payment path), so there is nothing to check.
- **A guest bookings or stays list on `/account`.** `bookingRequests` stays empty until `POST /api/booking-requests` exists, and tenant-assigned stays are not carried into v2 (§2.2.3).
- **When the booking endpoint lands, it must refuse a `closed` listing.** Nothing can over-book one today only because no booking path exists.
