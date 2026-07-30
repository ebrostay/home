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
