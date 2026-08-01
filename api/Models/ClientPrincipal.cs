using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;

namespace Ebrostay.Api.Models;

// The SWA-forwarded principal (spec §3.4). userRoles is the ONLY
// authorization input; userId is the ONLY identity key. Never trust a
// client-supplied user id or derive privileges from Cosmos data.
public record ClientPrincipal
{
    public string IdentityProvider { get; init; } = "";
    public string UserId { get; init; } = "";
    public string UserDetails { get; init; } = "";
    public string[] UserRoles { get; init; } = [];

    public bool IsAuthenticated => UserRoles.Contains("authenticated");
    public bool IsAdmin => UserRoles.Contains("admin");

    private static readonly JsonSerializerOptions JsonOpts =
        new() { PropertyNameCaseInsensitive = true };

    // Header absent/empty or malformed → null (anonymous). Never throws.
    public static ClientPrincipal? Parse(HttpRequest req)
    {
        if (!req.Headers.TryGetValue("x-ms-client-principal", out var header))
            return null;
        var encoded = header.ToString();
        if (string.IsNullOrEmpty(encoded)) return null;

        try
        {
            var json = Encoding.UTF8.GetString(Convert.FromBase64String(encoded));
            var principal = JsonSerializer.Deserialize<ClientPrincipal>(json, JsonOpts);
            return string.IsNullOrEmpty(principal?.UserId) ? null : principal;
        }
        catch
        {
            return null; // bad header → anonymous, never a 500
        }
    }
}
