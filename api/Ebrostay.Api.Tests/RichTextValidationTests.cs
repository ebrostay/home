using Ebrostay.Api.Models;
using Xunit;

namespace Ebrostay.Api.Tests;

// The validator is this feature's security boundary. It is the one place in
// the API with its own tests, and the reason is narrow: ten rejection codes
// are too many to check by curl and too important to leave unchecked.
public class RichTextValidationTests
{
    private static readonly HashSet<string> Photos = new(StringComparer.Ordinal) { "/p/1.jpg" };
    private static readonly HashSet<string> Entries = new(StringComparer.Ordinal) { "e1" };

    private static string? Check(RichNode doc) => HostValidation.RichText(doc, Photos, Entries);

    private static RichNode Doc(params RichNode[] content) => new("doc", content, null, null, null);
    private static RichNode P(params RichNode[] content) => new("paragraph", content, null, null, null);
    private static RichNode T(string text, params string[] marks) =>
        new("text", null, text, marks.Length == 0 ? null : marks.Select(m => new RichMark(m)).ToArray(), null);

    [Fact]
    public void AcceptsEveryNodeType() => Assert.Null(Check(Doc(
        new("heading", [T("Kitchen")], null, null, new RichAttrs(3, null, null, null)),
        P(T("Refitted in "), T("2024", "bold")),
        new("bulletList", [new("listItem", [P(T("Lift"))], null, null, null)], null, null, null),
        new("orderedList", [new("listItem", [P(T("One"))], null, null, null)], null, null, null),
        new("callout", [P(T("Good to know"))], null, null, null),
        new("photoFigure", null, null, null, new RichAttrs(null, "/p/1.jpg", "North", null)),
        new("placeCard", null, null, null, new RichAttrs(null, null, null, "e1")),
        P(new RichNode("placeRef", null, null, null, new RichAttrs(null, null, null, "e1"))))));

    [Fact]
    public void AcceptsNull() => Assert.Null(HostValidation.RichText(null, Photos, Entries));

    [Fact]
    public void RejectsBadRoot() => Assert.Equal("copy_bad_root", Check(P(T("x"))));

    [Fact]
    public void RejectsUnknownNode() => Assert.Equal("copy_bad_node", Check(Doc(new RichNode("iframe", null, null, null, null))));

    [Fact]
    public void RejectsLegalNodeInIllegalPlace() =>
        Assert.Equal("copy_bad_node", Check(Doc(P(P(T("nested"))))));

    [Fact]
    public void RejectsUnknownMark() => Assert.Equal("copy_bad_mark", Check(Doc(P(T("x", "link")))));

    [Fact]
    public void RejectsNonLevel3Heading() =>
        Assert.Equal("copy_bad_heading", Check(Doc(new RichNode("heading", [T("x")], null, null, new RichAttrs(1, null, null, null)))));

    [Fact]
    public void RejectsOverlongText() =>
        Assert.Equal("copy_too_long", Check(Doc(P(T(new string('x', HostValidation.MaxCopyLength + 1))))));

    [Fact]
    public void RejectsOverlongCaption() =>
        Assert.Equal("copy_bad_caption", Check(Doc(new RichNode("photoFigure", null, null, null, new RichAttrs(null, "/p/1.jpg", new string('c', 201), null)))));

    // The load-bearing one. An off-document URL would render in a public <img>.
    [Fact]
    public void RejectsOffDocumentPhoto() =>
        Assert.Equal("copy_photo_unknown", Check(Doc(new RichNode("photoFigure", null, null, null, new RichAttrs(null, "https://evil.example/x.jpg", null, null)))));

    [Fact]
    public void RejectsUnknownPlace() =>
        Assert.Equal("copy_place_unknown", Check(Doc(P(new RichNode("placeRef", null, null, null, new RichAttrs(null, null, null, "nope"))))));

    [Fact]
    public void RejectsTextNodeWithChildren() =>
        Assert.Equal("copy_bad_node", Check(Doc(P(new RichNode("text", [T("y")], "x", null, null)))));

    // Expects copy_bad_node, NOT copy_too_deep. The content model already
    // bounds depth: the longest legal chain is doc>bulletList>listItem>
    // paragraph>text, which is exactly MaxCopyDepth, and listItem admits only
    // paragraph so lists cannot nest. A bomb therefore becomes content-model
    // illegal at depth ~4 and is refused there. That IS the property under
    // test — the other 38 wraps are never visited. The depth guard stays as
    // defence in depth for a future content-model change; it is unreachable
    // today by construction. (Established in Task 2; TS behaves identically.)
    [Fact]
    public void RejectsNestingBomb()
    {
        var n = P(T("deep"));
        for (var i = 0; i < 40; i++)
            n = new RichNode("bulletList", [new("listItem", [n], null, null, null)], null, null, null);
        Assert.Equal("copy_bad_node", Check(Doc(n)));
    }

    [Fact]
    public void RejectsTooManyNodes() =>
        Assert.Equal("copy_too_many_nodes",
            Check(Doc(Enumerable.Range(0, HostValidation.MaxCopyNodes + 1).Select(_ => P(T("x"))).ToArray())));

    [Fact]
    public void AcceptsEmptyDocument() => Assert.Null(Check(Doc()));
}
