using System.Text;
using Ebrostay.Api.Models;
using Ebrostay.Api.Serialization;
using Microsoft.Extensions.Logging.Abstractions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;
using Xunit;

namespace Ebrostay.Api.Tests;

// The owner's manage page died with `RangeError: Invalid time value` on any
// portfolio holding a listing in review (2026-07-30, found by walking every
// page in the browser). The API was returning
//
//     "updatedAt": "07/22/2026 12:00:00"
//
// for a document stored as "2026-07-22T12:00:00Z". `PropertyRow` builds its
// "submitted on <date>" line with `new Date(iso.slice(0, 10) + "T12:00:00")`,
// which on that value is `Invalid Date`, and `Intl.DateTimeFormat.format`
// throws on it — taking out the entire page, not just the one line.
//
// Cause: Newtonsoft's default DateParseHandling.DateTime promotes any
// date-shaped JSON *string* to a DateTime token while reading, and reading
// that token into `PropertyDoc.UpdatedAt` (declared `string`) formats it back
// out under the host's current culture. The two list endpoints only became
// exposed to it when they started reading `JObject` for per-document error
// isolation — a typed iterator binds straight to `string`.
//
// These pin the production path: response bytes -> serializer -> JObject ->
// PropertyDocParser. Verified against the unfixed code (CosmosClientOptions
// with `SerializerOptions = { PropertyNamingPolicy = CamelCase }` and no
// custom Serializer, whose behaviour is exactly the `SdkDefault` control
// below): every assertion here fails, reporting the "07/22/2026 12:00:00"
// form.
public class CosmosDateSafeSerializerTests
{
    private const string Iso = "2026-07-22T12:00:00Z";

    private static Stream Json(string body) =>
        new MemoryStream(Encoding.UTF8.GetBytes(body));

    private static string Document(string updatedAt) =>
        $$"""
        {
          "id": "pedro1",
          "hostId": "seed-host",
          "status": "pending_review",
          "createdAt": "{{updatedAt}}",
          "updatedAt": "{{updatedAt}}"
        }
        """;

    [Fact]
    public void IsoTimestampSurvivesTheReadAsAString()
    {
        var serializer = new CosmosDateSafeSerializer();

        var raw = serializer.FromStream<JObject>(Json(Document(Iso)));
        var doc = PropertyDocParser.TryParse(raw, NullLogger.Instance, "test");

        Assert.NotNull(doc);
        Assert.Equal(Iso, doc!.UpdatedAt);
        Assert.Equal(Iso, doc.CreatedAt);
    }

    // The JObject itself must still hold a *string* token. If the value has
    // already become a Date by the time the JObject exists, no downstream
    // conversion can recover the original text — which is why the fix lives in
    // the serializer and not in PropertyDocParser.
    [Fact]
    public void TheRawTokenIsNotPromotedToADate()
    {
        var serializer = new CosmosDateSafeSerializer();

        var raw = serializer.FromStream<JObject>(Json(Document(Iso)));

        Assert.Equal(JTokenType.String, raw["updatedAt"]!.Type);
    }

    // The control: what the SDK's own camelCase serializer does with the same
    // bytes. Not a requirement — a demonstration that the bug is real and that
    // the setting above is the only thing standing between us and it. If this
    // ever starts agreeing with the fixed serializer, Newtonsoft changed its
    // default and the class this pins can be reconsidered.
    [Fact]
    public void SdkDefaultDateParsingIsWhatBrokeIt()
    {
        var settings = new JsonSerializerSettings
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
        };

        using var text = new StreamReader(Json(Document(Iso)));
        using var reader = new JsonTextReader(text);
        var raw = JsonSerializer.Create(settings).Deserialize<JObject>(reader)!;
        var doc = raw.ToObject<PropertyDoc>();

        Assert.Equal(JTokenType.Date, raw["updatedAt"]!.Type);
        Assert.NotEqual(Iso, doc!.UpdatedAt);
    }

    // Round-tripping must not rewrite what we store, or the fix would repair
    // reads by corrupting writes.
    [Fact]
    public void WritingThenReadingLeavesTheTimestampUnchanged()
    {
        var serializer = new CosmosDateSafeSerializer();
        var doc = new PropertyDoc { Id = "pedro1", UpdatedAt = Iso, CreatedAt = Iso };

        var round = serializer.FromStream<JObject>(serializer.ToStream(doc));

        Assert.Equal(Iso, round["updatedAt"]!.Value<string>());
        Assert.Equal("pedro1", round["id"]!.Value<string>());
    }
}
