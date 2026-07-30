using Ebrostay.Api.Functions;
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

    private static ImportResult Result(string[] imported) =>
        new(new ImportListingPatch(), new ImportPricingPatch(), imported);

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

    [Fact]
    public void RejectsAResultMissingItsSubObjects()
    {
        // System.Text.Json will happily deserialize `{"result":{}}` by
        // leaving Listing/Pricing/Imported null despite their non-nullable
        // C# types — reachable by any holder of a valid callback token.
        // Before this was guarded, CheckCallback's own `result.Imported.Length`
        // threw a NullReferenceException instead of returning a 400.
        Assert.Equal("result_invalid",
            ImportValidation.CheckCallback(new("done", new ImportResult(null!, null!, null!), null)));
    }
}

public class ImportClampTests
{
    private static ImportResult WithPrice(int price) =>
        new(new ImportListingPatch(), new ImportPricingPatch(PriceNumber: price), ["price"]);

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

    [Fact]
    public void ClampToleratesMissingSubObjects()
    {
        // Defense in depth: Clamp must not crash even if a future caller
        // skips CheckCallback's own guard (the normal Callback flow never
        // does — CheckCallback rejects this shape with "result_invalid"
        // before Clamp is ever reached).
        var clamped = ImportValidation.Clamp(new ImportResult(null!, null!, null!));
        Assert.NotNull(clamped.Listing);
        Assert.NotNull(clamped.Pricing);
        Assert.Empty(clamped.Imported);
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

// Task 4 review, Important finding 3: none of ImportFunctions' own transition
// rules were reachable from a unit test, because the decision was inline
// inside the Cosmos read/write. These exercise the pure ImportDecision
// directly — no emulator, no HTTP context.
public class ImportDecisionTests
{
    private static readonly DateTimeOffset Now =
        DateTimeOffset.Parse("2026-07-30T09:10:00Z");

    private static ImportJobDoc Job(string stage, string deadlineAt = "2026-07-30T09:05:00Z") =>
        new("imp_1", "owner-1", new ImportJobSource("url", "idealista", "https://x"),
            stage, "2026-07-30T09:00:00Z", "2026-07-30T09:00:00Z", deadlineAt,
            "s3cr3t", null, null, 604800);

    // --- TokenMatches --------------------------------------------------

    [Fact]
    public void TokenMatchesAcceptsTheExactToken() =>
        Assert.True(ImportDecision.TokenMatches("s3cr3t", "s3cr3t"));

    [Fact]
    public void TokenMatchesRejectsAWrongTokenOfTheSameLength() =>
        Assert.False(ImportDecision.TokenMatches("s3cr3x", "s3cr3t"));

    [Fact]
    public void TokenMatchesRejectsATokenOfADifferentLength() =>
        Assert.False(ImportDecision.TokenMatches("short", "s3cr3t"));

    [Fact]
    public void TokenMatchesRejectsAnEmptyPresentedToken() =>
        Assert.False(ImportDecision.TokenMatches("", "s3cr3t"));

    // --- Next: the 409 / no-op / applied split --------------------------

    [Fact]
    public void ATerminalJobRefusesAnyFurtherWrite()
    {
        var result = ImportDecision.Next(Job(ImportStage.Done),
            new ImportCallback(ImportStage.Failed, null, new ImportError("timeout")), Now);

        Assert.Equal(ImportDecision.CallbackOutcome.Conflict, result.Outcome);
        Assert.Null(result.Job);
    }

    [Fact]
    public void ACancelledJobAlsoRefusesAFurtherWrite()
    {
        // The design's own example: the pipeline finishing a job the owner
        // already cancelled must be a no-op, not a resurrection.
        var result = ImportDecision.Next(Job(ImportStage.Cancelled),
            new ImportCallback(ImportStage.Done,
                new ImportResult(new ImportListingPatch(), new ImportPricingPatch(), []), null),
            Now);

        Assert.Equal(ImportDecision.CallbackOutcome.Conflict, result.Outcome);
    }

    [Fact]
    public void AReportBehindTheCurrentStageIsDroppedNotApplied()
    {
        // The job is already at "matching"; a late "reading" report from a
        // retried pipeline step must not walk it backwards.
        var result = ImportDecision.Next(Job(ImportStage.Matching),
            new ImportCallback(ImportStage.Reading, null, null), Now);

        Assert.Equal(ImportDecision.CallbackOutcome.NoOp, result.Outcome);
        Assert.Null(result.Job);
    }

    [Fact]
    public void AForwardReportIsAppliedWithTheGivenTimestamp()
    {
        var result = ImportDecision.Next(Job(ImportStage.Reading),
            new ImportCallback(ImportStage.Matching, null, null), Now);

        Assert.Equal(ImportDecision.CallbackOutcome.Applied, result.Outcome);
        Assert.Equal(ImportStage.Matching, result.Job!.Stage);
        Assert.Equal(Now.ToString("o"), result.Job.UpdatedAt);
    }

    [Fact]
    public void ADoneReportCarriesAClampedResult()
    {
        var result = ImportDecision.Next(Job(ImportStage.Matching),
            new ImportCallback(ImportStage.Done,
                new ImportResult(new ImportListingPatch(), new ImportPricingPatch(PriceNumber: 950),
                    ["price"]),
                null),
            Now);

        Assert.Equal(ImportDecision.CallbackOutcome.Applied, result.Outcome);
        Assert.Equal(950, result.Job!.Result!.Pricing.PriceNumber);
    }

    [Fact]
    public void AReportWithNoResultKeepsWhateverTheJobAlreadyHad()
    {
        var existing = new ImportResult(new ImportListingPatch(), new ImportPricingPatch(PriceNumber: 700),
            ["price"]);
        var job = Job(ImportStage.Matching) with { Result = existing };

        var result = ImportDecision.Next(job, new ImportCallback(ImportStage.Matching, null, null), Now);

        Assert.Same(existing, result.Job!.Result);
    }

    // --- Reap ------------------------------------------------------------

    [Fact]
    public void ReapLeavesATerminalJobAlone() =>
        Assert.Null(ImportDecision.Reap(Job(ImportStage.Done), Now));

    [Fact]
    public void ReapLeavesARunningJobAloneBeforeItsDeadline() =>
        Assert.Null(ImportDecision.Reap(
            Job(ImportStage.Reading, deadlineAt: "2026-07-30T09:20:00Z"), Now));

    [Fact]
    public void ReapFailsARunningJobPastItsDeadline()
    {
        var reaped = ImportDecision.Reap(
            Job(ImportStage.Reading, deadlineAt: "2026-07-30T09:05:00Z"), Now);

        Assert.NotNull(reaped);
        Assert.Equal(ImportStage.Failed, reaped!.Stage);
        Assert.Equal("timeout", reaped.Error!.Code);
    }

    // --- Cancel ----------------------------------------------------------
    //
    // Task 4 re-review, Important finding: ImportFunctions.Cancel used to
    // answer 204 for ANY stale write, including one that lost to a
    // concurrent non-terminal progress update — which would tell the owner
    // "cancelled" while the job kept running. The fix retries the cancel
    // once against a fresh read; these tests pin down what each half of
    // that retry decides.

    [Fact]
    public void CancelLeavesATerminalJobAlone() =>
        Assert.Null(ImportDecision.Cancel(Job(ImportStage.Done), Now));

    [Fact]
    public void CancelLeavesACancelledJobAlone() =>
        // Cancelling twice must not be a second write.
        Assert.Null(ImportDecision.Cancel(Job(ImportStage.Cancelled), Now));

    [Fact]
    public void CancelMovesARunningJobToCancelled()
    {
        var cancelled = ImportDecision.Cancel(Job(ImportStage.Reading), Now);

        Assert.NotNull(cancelled);
        Assert.Equal(ImportStage.Cancelled, cancelled!.Stage);
        Assert.Equal(Now.ToString("o"), cancelled.UpdatedAt);
    }

    // ImportFunctions.Cancel calls this SAME function again, against a fresh
    // read, when its first write loses a race — so "the job is terminal by
    // the time the retry looks" and "the job was already terminal on the
    // first read" (CancelLeavesATerminalJobAlone, above) are the identical
    // case from Cancel()'s point of view: it takes no state beyond the job
    // it is handed. That equivalence is what lets ImportFunctions retry
    // without a separate "is it done now" branch of its own.

    // --- ExceedsRunningCap -------------------------------------------------

    [Theory]
    [InlineData(0, false)]
    [InlineData(1, false)]
    [InlineData(2, true)]
    [InlineData(3, true)]
    public void TheRunningCapIsTwoAtOnce(int running, bool expected) =>
        Assert.Equal(expected, ImportDecision.ExceedsRunningCap(running));
}
