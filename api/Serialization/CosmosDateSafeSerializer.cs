using System.Text;
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace Ebrostay.Api.Serialization;

/// The Cosmos serializer for every read and write in this API.
///
/// It exists for one setting: <see cref="DateParseHandling.None"/>.
///
/// Newtonsoft's default is <see cref="DateParseHandling.DateTime"/>, which
/// inspects every JSON *string* and silently promotes anything that parses as
/// a date into a `DateTime` token. Deserialized into a typed model that
/// declares the field as `string` — which every timestamp in `PropertyDoc`
/// does — the token is then formatted back out with `ToString()`, under the
/// host's current culture. A document stored as
///
///     "updatedAt": "2026-07-22T12:00:00Z"
///
/// therefore came back as `07/22/2026 12:00:00`. That value is not an ISO
/// date, so the portfolio's `day()` formatter built an `Invalid Date` from it
/// and the owner's whole manage page died with a `RangeError` — and the
/// ordinal sort on `UpdatedAt` was ordering by month, not by time.
///
/// The coercion happens when the response stream is read, so it cannot be
/// undone downstream: by the time a `JObject` exists, the string is already a
/// date token. It only became reachable when the two list endpoints started
/// reading `JObject` for per-document error isolation (ADR-032) — a typed
/// `GetItemQueryIterator&lt;PropertyDoc&gt;` binds straight to `string` and
/// never round-trips through a token. Fixing it here rather than at those two
/// call sites means a third one cannot reintroduce it.
///
/// Everything else matches the SDK's own `CosmosJsonDotNetSerializer` under
/// `CosmosPropertyNamingPolicy.CamelCase`, which this replaces:
/// `CamelCasePropertyNamesContractResolver` is exactly what that option
/// installs, so stored documents keep their existing shape.
public sealed class CosmosDateSafeSerializer : CosmosSerializer
{
    private static readonly JsonSerializerSettings Settings = new()
    {
        DateParseHandling = DateParseHandling.None,
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
    };

    private static readonly JsonSerializer Serializer = JsonSerializer.Create(Settings);

    // The SDK hands its own response streams back to callers that ask for
    // Stream, and expects the serializer to pass them through untouched.
    public override T FromStream<T>(Stream stream)
    {
        using (stream)
        {
            if (typeof(Stream).IsAssignableFrom(typeof(T))) return (T)(object)stream;

            using var text = new StreamReader(stream);
            using var reader = new JsonTextReader(text)
            {
                // Belt and braces: the serializer setting above already
                // configures the reader, but this is the setting the whole
                // class exists for — it is stated where it takes effect.
                DateParseHandling = DateParseHandling.None,
            };
            return Serializer.Deserialize<T>(reader)!;
        }
    }

    public override Stream ToStream<T>(T input)
    {
        var payload = new MemoryStream();
        using (var text = new StreamWriter(payload, new UTF8Encoding(false, true), 1024, leaveOpen: true))
        using (var writer = new JsonTextWriter(text) { Formatting = Formatting.None })
        {
            Serializer.Serialize(writer, input);
            writer.Flush();
            text.Flush();
        }

        payload.Position = 0;
        return payload;
    }
}
