namespace Ebrostay.Api.Models;

// The listing description document — design 2026-07-29. A plain tree, walked
// by HostValidation.RichText and rendered by the client. NOTHING here knows
// about Tiptap or ProseMirror; the shape is just what those happen to emit.

/// One node. `Attrs` is a TYPED record rather than a dictionary on purpose:
/// System.Text.Json silently drops any JSON property it has no member for, so
/// attribute stripping is structural and there is no allowlist to maintain.
public record RichNode(
    string? Type,
    RichNode[]? Content,
    string? Text,
    RichMark[]? Marks,
    RichAttrs? Attrs);

/// Marks carry NO attributes. A link mark is not rejected — it is
/// unrepresentable, because there is nowhere for an href to live.
public record RichMark(string? Type);

public record RichAttrs(
    int? Level,
    string? Url,
    string? Caption,
    string? EntryId);

/// The bilingual pair. Distinct from `Bilingual`, which stays a pair of plain
/// strings for `details`, `beds` and `priceNote`.
public record BilingualDoc(RichNode? Es, RichNode? En);
