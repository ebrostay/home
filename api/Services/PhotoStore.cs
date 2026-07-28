using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Ebrostay.Api.Services;

// Blob storage for listing photos — spec-v2 §2.6, ADR-019.
//
// The container is PUBLIC-READ, which is the fact the whole upload path is
// designed around: a photo is not a file we keep, it is a URL we host and hand
// out to anyone. So nothing reaches here that has not been through
// `PhotoPipeline` first — by the time bytes arrive they are pixels we encoded
// ourselves, under a name we chose.
//
// No SAS token and no storage key ever leaves the server (ADR-019, locked).
// Bytes travel client → Function → Blob.
public class PhotoStore(BlobServiceClient blobs)
{
    public const string ContainerName = "property-photos";

    /// A year, matching v1 practice (docs/spec/07 §7.1). Safe because a blob
    /// name is never reused: replacing a photo writes a new name rather than
    /// overwriting one, so a cached copy can never be the wrong image.
    private const string CacheControl = "public, max-age=31536000, immutable";

    private BlobContainerClient? container;

    /// Created on first use rather than at startup: a Function that cannot
    /// reach storage should fail the upload it was asked for, not refuse to
    /// start and take the whole API — including every read path — with it.
    private async Task<BlobContainerClient> ContainerAsync()
    {
        if (container is not null) return container;
        var client = blobs.GetBlobContainerClient(ContainerName);
        await client.CreateIfNotExistsAsync(PublicAccessType.Blob);
        return container = client;
    }

    /// Writes one variant and returns its public URL. `name` is always
    /// server-generated (`{propertyId}/{guid}-{size}.webp`) — a client filename
    /// here would be path traversal and cross-listing overwrite in one.
    public async Task<string> PutAsync(string name, byte[] bytes, CancellationToken token)
    {
        var blob = (await ContainerAsync()).GetBlobClient(name);
        using var stream = new MemoryStream(bytes, writable: false);
        await blob.UploadAsync(
            stream,
            new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders
                {
                    // Set by us from what we encoded, never echoed from the
                    // request: Blob serves whatever content type it is given,
                    // so a client-supplied one is stored XSS on our own domain.
                    ContentType = "image/webp",
                    CacheControl = CacheControl,
                },
            },
            token);
        return blob.Uri.ToString();
    }

    /// Best-effort. A blob that outlives its document is waste; a delete that
    /// fails must not cost the owner the edit they were making, so callers
    /// treat this as cleanup rather than as part of the write.
    public async Task<bool> DeleteAsync(string url, CancellationToken token)
    {
        var name = NameFrom(url);
        if (name is null) return false;
        try
        {
            var response = await (await ContainerAsync())
                .GetBlobClient(name)
                .DeleteIfExistsAsync(cancellationToken: token);
            return response.Value;
        }
        catch (RequestFailedException)
        {
            return false;
        }
    }

    /// The blob name inside a stored URL, or null if the URL is not one of
    /// ours. Deleting is driven by URLs that came off a document, and a
    /// document is not a place to trust blindly — a stray URL from anywhere
    /// else must not resolve to a name we would then act on.
    private static string? NameFrom(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return null;
        var path = uri.AbsolutePath.TrimStart('/');
        // Azurite puts the account first (`/devstoreaccount1/property-photos/…`),
        // Azure puts the container at the root. Anchor on the container either
        // way rather than counting segments.
        var marker = $"{ContainerName}/";
        var at = path.IndexOf(marker, StringComparison.Ordinal);
        if (at < 0) return null;
        var name = Uri.UnescapeDataString(path[(at + marker.Length)..]);
        return name.Length > 0 && !name.Contains("..", StringComparison.Ordinal) ? name : null;
    }
}
