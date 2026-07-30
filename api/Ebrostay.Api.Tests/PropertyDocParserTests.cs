using Ebrostay.Api.Models;
using Microsoft.Extensions.Logging.Abstractions;
using Newtonsoft.Json.Linq;
using Xunit;

namespace Ebrostay.Api.Tests;

// Finding 2 (production-readiness review, 2026-07-30): `PropertiesFunctions.List`
// used to hand `GetItemQueryIterator<PropertyDoc>` a page containing a legacy
// document — `description` still stored as the old `{ es: "…", en: "…" }` string pair
// — and one such document threw out of the loop, taking the ENTIRE public
// listings response down with it, not merely that listing's own detail page
// (ADR-032's "Legacy plain-string `copy` throws, not degrades"). The fix reads
// each item as a raw `JObject` and converts through `PropertyDocParser.TryParse`,
// which is the seam this pins directly — no Cosmos/HTTP harness exists in this
// repo (see api/Ebrostay.Api.Tests's other files: every test here is a pure
// function over Models types, nothing constructs a Container or an HTTP
// request), so the Cosmos-iterator-level blast radius itself is not
// reproducible as a unit test; this is the narrowest reproduction available.
//
// Verified against the unfixed code (a bare `raw.ToObject<PropertyDoc>()`
// with no try/catch, i.e. `TryParse`'s body without the `catch` block): the
// legacy-document case below throws `Newtonsoft.Json.JsonSerializationException`
// out of the call instead of returning null, so this test fails (by throwing)
// against that version and passes only with the try/catch in place.
public class PropertyDocParserTests
{
    [Fact]
    public void LegacyPlainStringCopySkipsInsteadOfThrowing()
    {
        var raw = JObject.Parse("""
            {
                "id": "legacy-1",
                "status": "published",
                "name": "Old listing",
                "description": { "es": "Un piso céntrico.", "en": "A central flat." }
            }
            """);

        var doc = PropertyDocParser.TryParse(raw, NullLogger.Instance, "test");

        Assert.Null(doc);
    }

    [Fact]
    public void WellFormedDocumentParsesNormally()
    {
        var raw = JObject.Parse("""
            {
                "id": "p1",
                "status": "published",
                "name": "A real listing",
                "description": {
                    "es": { "type": "doc", "content": [] },
                    "en": { "type": "doc", "content": [] }
                }
            }
            """);

        var doc = PropertyDocParser.TryParse(raw, NullLogger.Instance, "test");

        Assert.NotNull(doc);
        Assert.Equal("p1", doc!.Id);
        Assert.Equal("A real listing", doc.Name);
    }
}
