using MetadataExtractor;
using MetadataExtractor.Formats.Exif;
using SkiaSharp;

namespace Ebrostay.Api.Services;

// What "validates, compresses" actually means — ADR-019 amendment 2026-07-28.
//
// The starting fact is that `property-photos` is public-read. An upload is not
// a file we store, it is a URL we host and serve to anyone, with whatever
// content type it carries. That, not "malware", is what this defends against.
//
// Re-encoding does most of the work: decode to pixels, write out a fresh WebP.
// Anything that is not pixels — an appended archive, a polyglot file, script
// in a metadata field, EXIF — does not survive the round trip. What it does
// NOT defend is a file crafted against the decoder itself, which is why the
// dimension check below happens BEFORE any decoding: a 10 KB PNG can declare
// 50000x50000 and take the Function's memory with it.
public class PhotoPipeline
{
    /// The long edge of each stored variant. The browser is asked to downscale
    /// to `Full` before uploading, but that is a transfer optimisation and its
    /// output is untrusted like any other input — the server resizes again
    /// regardless, and an image that arrives smaller is simply not upscaled.
    ///
    /// Measured from what actually renders: a search card is 407x280 CSS, so
    /// 800 is almost exactly a retina card; the gallery hero is ~630 CSS, so
    /// 1600 covers it at 2x. `Full` is the master every other size is derived
    /// from, which is the whole reason the browser is not allowed to produce a
    /// final size — a browser-made thumbnail would be a lossy master.
    public const int CardEdge = 800;
    public const int DetailEdge = 1600;
    public const int FullEdge = 2560;

    /// Before decode. `MaxPhotos` caps the count; this caps one file.
    public const int MaxBytes = 25 * 1024 * 1024;

    /// Also before decode, read from the header. Comfortably above a 100 MP
    /// phone camera, far below a decompression bomb.
    public const int MaxPixels = 120_000_000;
    public const int MaxEdge = 20_000;

    /// WebP at 82 is where the artefacts stop being visible on photographic
    /// content while the file is roughly a third of the equivalent JPEG.
    private const int Quality = 82;

    public record Variant(string Suffix, int Edge, byte[] Bytes);

    /// Where the camera said it was. All nullable and usually null — most
    /// platforms strip EXIF on the way, and plenty of people keep location
    /// off. Extracted before the re-encode throws it away, and kept as
    /// admin-only data (§2.2.2, ADR-019 amendment).
    public record Capture(double? Lat, double? Lng, string? At);

    public record Result(Variant[] Variants, Capture Capture);

    /// A refusal, as a stable code the client maps to bilingual copy.
    public class RejectedException(string code) : Exception(code)
    {
        public string Code { get; } = code;
    }

    public Result Process(byte[] input)
    {
        if (input.Length == 0) throw new RejectedException("photo_empty");
        if (input.Length > MaxBytes) throw new RejectedException("photo_too_large");

        // 1. What is this, really? Sniffed from the bytes, never from the
        //    request's content type or the filename — both are the client's to
        //    write, and the stored content type is what a browser will act on.
        var kind = Sniff(input);
        if (kind == Kind.Heic) throw new RejectedException("photo_heic");
        if (kind == Kind.Svg) throw new RejectedException("photo_svg");
        if (kind == Kind.Unknown) throw new RejectedException("photo_not_an_image");

        // 2. EXIF, while there still is any. This reads metadata blocks, not
        //    pixels, so it is cheap and happens before the expensive step.
        var capture = ReadCapture(input);

        // 3. Dimensions from the header, still before decoding anything.
        using var codec = SKCodec.Create(new MemoryStream(input, writable: false));
        if (codec is null) throw new RejectedException("photo_unreadable");

        var info = codec.Info;
        if (info.Width <= 0 || info.Height <= 0) throw new RejectedException("photo_unreadable");
        if (info.Width > MaxEdge || info.Height > MaxEdge ||
            (long)info.Width * info.Height > MaxPixels)
            throw new RejectedException("photo_too_large");

        // 4. Now decode.
        using var decoded = SKBitmap.Decode(codec);
        if (decoded is null) throw new RejectedException("photo_unreadable");

        // 5. Orientation has to be applied by hand. It lives in EXIF, which
        //    step 6 destroys — so without this, every portrait photo from a
        //    phone would publish on its side.
        using var upright = Upright(decoded, codec.EncodedOrigin);

        var variants = new List<Variant>();
        foreach (var (suffix, edge) in new[]
                 {
                     ("full", FullEdge), ("detail", DetailEdge), ("card", CardEdge),
                 })
        {
            variants.Add(new Variant(suffix, edge, Encode(upright, edge)));
        }

        return new Result([.. variants], capture);
    }

    // ------------------------------------------------------------------
    // Format sniffing
    // ------------------------------------------------------------------

    private enum Kind { Unknown, Jpeg, Png, Webp, Heic, Svg }

    /// The allowlist is JPEG, PNG and WebP, decided by magic bytes.
    ///
    /// SVG is called out separately rather than just falling through as
    /// unknown, because it is a *legitimate* image format and the refusal
    /// deserves its own reason: an SVG can carry `<script>`, and opened
    /// directly rather than inside an `<img>` it executes in the storage
    /// origin. No flat photo of a room is a vector.
    ///
    /// HEIC likewise: recognising it is what lets the owner be told to export
    /// as JPEG instead of being handed "that is not an image".
    private static Kind Sniff(byte[] b)
    {
        if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return Kind.Jpeg;

        if (b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47 &&
            b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A) return Kind.Png;

        if (b.Length >= 12 && Ascii(b, 0, "RIFF") && Ascii(b, 8, "WEBP")) return Kind.Webp;

        // ISO base media: `....ftyp<brand>`. HEIC/HEIF brands are a closed
        // enough set to name.
        if (b.Length >= 12 && Ascii(b, 4, "ftyp"))
        {
            var brand = System.Text.Encoding.ASCII.GetString(b, 8, 4);
            if (brand is "heic" or "heix" or "hevc" or "hevx" or "mif1" or "msf1" or "heim"
                or "heis" or "avif" or "avis") return Kind.Heic;
        }

        // SVG is text, and may open with a comment, a doctype or an XML
        // declaration before the tag ever appears — so look for the tag in the
        // opening bytes rather than only at offset zero.
        var head = System.Text.Encoding.ASCII.GetString(b, 0, Math.Min(b.Length, 1024));
        if (head.Contains("<svg", StringComparison.OrdinalIgnoreCase)) return Kind.Svg;

        return Kind.Unknown;
    }

    private static bool Ascii(byte[] b, int at, string text) =>
        b.Length >= at + text.Length &&
        System.Text.Encoding.ASCII.GetString(b, at, text.Length) == text;

    // ------------------------------------------------------------------
    // EXIF
    // ------------------------------------------------------------------

    /// Never throws. A photo with unreadable metadata is still a photo, and
    /// losing an optional review signal must not cost the owner their upload.
    private static Capture ReadCapture(byte[] input)
    {
        try
        {
            using var stream = new MemoryStream(input, writable: false);
            var directories = ImageMetadataReader.ReadMetadata(stream);

            var gps = directories.OfType<GpsDirectory>().FirstOrDefault();
            // A struct, so absent GPS and a present-but-empty block both have
            // to be unwrapped before they can be told apart.
            var found = gps?.GetGeoLocation();
            var location = found is { IsZero: false } ? found.Value : (GeoLocation?)null;

            var taken = directories.OfType<ExifSubIfdDirectory>()
                .Select(d => d.TryGetDateTime(ExifDirectoryBase.TagDateTimeOriginal, out var t)
                    ? (DateTime?)t
                    : null)
                .FirstOrDefault(t => t is not null);

            // 0,0 means the block was there and empty — Null Island is not a
            // Zaragoza flat, and reporting it would put a false outlier in
            // front of a reviewer.
            return new Capture(
                location?.Latitude,
                location?.Longitude,
                taken?.ToString("o"));
        }
        catch (Exception ex) when (ex is ImageProcessingException or IOException)
        {
            return new Capture(null, null, null);
        }
    }

    // ------------------------------------------------------------------
    // Pixels
    // ------------------------------------------------------------------

    /// EXIF orientation, applied to the pixels so it can be thrown away with
    /// the rest of the metadata.
    private static SKBitmap Upright(SKBitmap source, SKEncodedOrigin origin)
    {
        if (origin is SKEncodedOrigin.Default or SKEncodedOrigin.TopLeft)
            return source.Copy();

        // The four odd orientations swap the axes.
        var turned = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop
            or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;

        var width = turned ? source.Height : source.Width;
        var height = turned ? source.Width : source.Height;

        var result = new SKBitmap(width, height);
        using var canvas = new SKCanvas(result);
        using var matrix = new SKAutoCanvasRestore(canvas);

        switch (origin)
        {
            case SKEncodedOrigin.TopRight:
                canvas.Translate(width, 0);
                canvas.Scale(-1, 1);
                break;
            case SKEncodedOrigin.BottomRight:
                canvas.RotateDegrees(180, width / 2f, height / 2f);
                break;
            case SKEncodedOrigin.BottomLeft:
                canvas.Translate(0, height);
                canvas.Scale(1, -1);
                break;
            case SKEncodedOrigin.LeftTop:
                canvas.RotateDegrees(90);
                canvas.Scale(1, -1);
                break;
            case SKEncodedOrigin.RightTop:
                canvas.Translate(width, 0);
                canvas.RotateDegrees(90);
                break;
            case SKEncodedOrigin.RightBottom:
                canvas.Translate(width, 0);
                canvas.RotateDegrees(90);
                canvas.Translate(0, height);
                canvas.Scale(1, -1);
                break;
            case SKEncodedOrigin.LeftBottom:
                canvas.Translate(0, height);
                canvas.RotateDegrees(270);
                break;
        }

        canvas.DrawBitmap(source, 0, 0, new SKSamplingOptions(SKFilterMode.Linear));
        return result;
    }

    /// One variant. Never upscales: an owner who uploads a 600 px image gets a
    /// 600 px "card" rather than a blurry 800 px one, and the three URLs simply
    /// point at increasingly identical files.
    private static byte[] Encode(SKBitmap source, int edge)
    {
        var longest = Math.Max(source.Width, source.Height);
        var scale = longest > edge ? (double)edge / longest : 1.0;

        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
        var height = Math.Max(1, (int)Math.Round(source.Height * scale));

        using var resized = scale < 1.0
            ? source.Resize(new SKImageInfo(width, height), new SKSamplingOptions(SKCubicResampler.Mitchell))
            : source.Copy();

        using var image = SKImage.FromBitmap(resized ?? source);
        using var data = image.Encode(SKEncodedImageFormat.Webp, Quality);
        return data.ToArray();
    }
}
