using Ebrostay.Api.Models;
using Xunit;

namespace Ebrostay.Api.Tests;

// `amenitiesAbsent` is the second array a listing carries, and the pair has an
// invariant the single array never had: a home cannot both have and lack the
// same thing. Nothing in the UI can produce that — the picker's three states
// are exclusive — which is exactly why it is worth a test. A rule only ever
// exercised by a hand-built payload is a rule nobody would notice losing.
public class AmenityValidationTests
{
    private static readonly PropertyDoc Draft = new() { Status = "draft" };

    /// A payload that passes every check except the ones each test is about.
    private static DetailsUpdate Update(string[]? amenities, string[]? absent) =>
        new(
            Name: "Test", Type: "apartment", Address: "C. Mayor 1", Postcode: "50001",
            CadastralRef: null, Lat: 41.65, Lng: -0.89,
            Area: null, Description: null, DescriptionEnApproved: false,
            Details: null, Beds: null,
            Guests: 2, Bedrooms: 1, Bathrooms: 1, SizeM2: 60, FloorNumber: 1,
            EnergyRating: null,
            Amenities: amenities, AmenitiesAbsent: absent,
            PetsAllowed: false, SmokingAllowed: false, CouplesAllowed: false,
            SelfCheckin: false, Photos: null, Nearby: null,
            Imported: null, ImportSource: null);

    private static string? Check(string[]? amenities, string[]? absent) =>
        HostValidation.CheckDetails(Update(amenities, absent), Draft);

    [Fact]
    public void AcceptsAHomeThatHasSomeAndLacksOthers() =>
        Assert.Null(Check(["wifi", "heating"], ["lift", "parking"]));

    [Fact]
    public void AcceptsBothArraysOmitted() => Assert.Null(Check(null, null));

    // The whole point of the second array: an absence is still an answer, and
    // an answer that never reaches the document is a question asked twice.
    [Fact]
    public void AcceptsAbsencesWithNothingClaimed() =>
        Assert.Null(Check([], ["lift"]));

    [Fact]
    public void RejectsHavingAndLackingTheSameThing() =>
        Assert.Equal("amenity_contradiction", Check(["lift"], ["lift"]));

    // The kebab-case keys the catalogue actually ships. If the shape rule and
    // the vocabulary ever disagree, this is where it shows up — an owner would
    // otherwise fill in the whole wizard and lose it on the final save.
    [Theory]
    [InlineData("dining-table")]
    [InlineData("smoke-alarm")]
    [InlineData("accessible-bathroom")]
    [InlineData("ev-charger")]
    public void AcceptsTheCataloguesCompoundKeys(string key) =>
        Assert.Null(Check([key], []));

    [Fact]
    public void RejectsAnAbsenceThatIsNotAWellFormedKey() =>
        Assert.Equal("amenity_invalid", Check([], ["No lift, sorry!"]));

    [Fact]
    public void RejectsCamelCase() =>
        Assert.Equal("amenity_invalid", Check(["diningTable"], []));

    [Fact]
    public void RejectsARepeatedAbsence() =>
        Assert.Equal("amenity_duplicate", Check([], ["lift", "lift"]));

    [Fact]
    public void RejectsTooManyAbsences() =>
        Assert.Equal(
            "too_many_amenities",
            Check([], [.. Enumerable.Range(0, HostValidation.MaxAmenities + 1).Select(i => $"a{i}")]));
}
