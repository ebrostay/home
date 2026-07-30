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
