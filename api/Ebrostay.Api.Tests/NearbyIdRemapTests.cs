using Ebrostay.Api.Models;
using Xunit;

namespace Ebrostay.Api.Tests;

// Fix round 1 (2026-07-30): `NearbyEditor.tsx` mints client temp ids
// (`local-<ts>-<rand>`) for a nearby entry added in the editor.
// `HostFunctions.UpdateDetails` replaces any id that does not match a
// STORED entry with a fresh server-generated one — so a description that
// references a just-added place by its temp id would validate (the temp id
// IS in the incoming payload's `entryIds`) but then be stored pointing at an
// id nothing holds, once the entry itself is saved under its real id. The
// user's decision (2026-07-30): the server remaps `placeRef`/`placeCard`
// `entryId`s through the temp→final id map after the nearby array is
// rebuilt. `HostValidation.RemapPlaceIds` is the pure function that does the
// rewrite; these tests pin its behaviour directly, the same granularity as
// `RichTextValidationTests` pins the validator.
public class NearbyIdRemapTests
{
    private static RichNode Doc(params RichNode[] content) => new("doc", content, null, null, null);
    private static RichNode P(params RichNode[] content) => new("paragraph", content, null, null, null);
    private static RichNode T(string text) => new("text", null, text, null, null);
    private static RichNode PlaceRef(string entryId) =>
        new("placeRef", null, null, null, new RichAttrs(null, null, null, entryId));
    private static RichNode PlaceCard(string entryId) =>
        new("placeCard", null, null, null, new RichAttrs(null, null, null, entryId));
    private static RichNode PhotoRef(string url) =>
        new("photoRef", null, null, null, new RichAttrs(null, url, null, null));

    // A description referencing a new entry's temp id: after the remap the
    // stored document holds the entry's final server id.
    [Fact]
    public void RewritesTempIdToFinalId()
    {
        var doc = Doc(P(T("Near the "), PlaceRef("local-1690000000000-abc123")));
        var remap = new Dictionary<string, string> { ["local-1690000000000-abc123"] = "f3a9c1" };

        var result = HostValidation.RemapPlaceIds(doc, remap);

        var place = Assert.IsType<RichNode>(result!.Content![0].Content![1]);
        Assert.Equal("f3a9c1", place.Attrs!.EntryId);
    }

    // A description referencing an existing entry's real (already-stored)
    // id is unchanged: that id was never in `remap` because it matched a
    // stored entry, so the fallthrough (`TryGetValue` returning false)
    // leaves it exactly as it was.
    [Fact]
    public void LeavesExistingRealIdUnchanged()
    {
        var doc = Doc(P(PlaceRef("e1")));
        var remap = new Dictionary<string, string> { ["local-999"] = "abc" }; // unrelated entry

        var result = HostValidation.RemapPlaceIds(doc, remap);

        Assert.Equal("e1", result!.Content![0].Content![0].Attrs!.EntryId);
    }

    // Both locale documents are remapped — `UpdateDetails` calls this once
    // per locale, but the map itself, and therefore the rewrite rule, must
    // be identical for both.
    [Fact]
    public void RewritesBothLocaleDocuments()
    {
        var remap = new Dictionary<string, string> { ["local-1"] = "srv-1" };
        var es = Doc(P(PlaceCard("local-1")));
        var en = Doc(P(PlaceCard("local-1")));

        var esResult = HostValidation.RemapPlaceIds(es, remap);
        var enResult = HostValidation.RemapPlaceIds(en, remap);

        Assert.Equal("srv-1", esResult!.Content![0].Content![0].Attrs!.EntryId);
        Assert.Equal("srv-1", enResult!.Content![0].Content![0].Attrs!.EntryId);
    }

    // A `photoRef` beside the `placeRef` in the same document is left
    // completely untouched — the rewrite is scoped to place nodes only, and
    // must not so much as reallocate an unrelated node's attrs in a way that
    // changes its value.
    [Fact]
    public void LeavesPhotoRefUntouched()
    {
        var doc = Doc(P(PhotoRef("/p/1.jpg"), PlaceRef("local-1")));
        var remap = new Dictionary<string, string> { ["local-1"] = "srv-1" };

        var result = HostValidation.RemapPlaceIds(doc, remap);

        var photo = result!.Content![0].Content![0];
        Assert.Equal("photoRef", photo.Type);
        Assert.Equal("/p/1.jpg", photo.Attrs!.Url);
    }

    // An empty remap (the ordinary case — no new entries this save) must be
    // a true no-op, not merely an equivalent tree: `UpdateDetails` calls
    // this unconditionally, so on every save with nothing to remap the
    // stored document must be bit-for-bit what was already validated.
    [Fact]
    public void EmptyRemapReturnsSameInstance()
    {
        var doc = Doc(P(PlaceRef("e1")));
        var result = HostValidation.RemapPlaceIds(doc, new Dictionary<string, string>());
        Assert.Same(doc, result);
    }

    // A null document (the "no description in this locale" case `RichText`
    // itself treats as valid) stays null rather than throwing.
    [Fact]
    public void NullDocumentStaysNull() =>
        Assert.Null(HostValidation.RemapPlaceIds(null, new Dictionary<string, string> { ["a"] = "b" }));
}
