using Ebrostay.Api.Models;

namespace Ebrostay.Api.Services;

/// What a reviewer has to judge before a band goes public (ADR-041).
///
/// The band is the disclosure unit: the guest sees the STREET, never the door.
/// That only holds while the band is long enough that the home could be any of
/// several on it. Derived from a short cul-de-sac, or from a street whose
/// junctions sit close together, the band can come back spanning one building
/// front — and a band over one building front IS the address, drawn in blue.
///
/// Geometry cannot decide this on its own (a 70 m band over one detached villa
/// discloses more than a 70 m band over a block of forty flats), so nothing
/// here blocks anything. It gives the reviewer a number and a flag; the
/// judgement, and the tick that records it, stay with the person.
public static class BandDisclosure
{
    /// Below this, the band is flagged for the reviewer. 60 m is roughly one
    /// urban block face in Zaragoza — under it, the band stops being "this
    /// street" and starts being "this doorway".
    public const int MinSafeLengthMetres = 60;

    /// The band's length along its own line, in metres.
    public static double LengthMetres(StreetBand band)
    {
        var total = 0d;
        for (var i = 1; i < band.Line.Length; i++)
            total += OverpassClient.Haversine(
                band.Line[i - 1].Lat, band.Line[i - 1].Lng,
                band.Line[i].Lat, band.Line[i].Lng);
        return total;
    }

    /// True when the band is short enough that it points at one home rather
    /// than at a street. Advisory — see the class note.
    public static bool IdentifiesSingleHome(StreetBand band) =>
        LengthMetres(band) < MinSafeLengthMetres;
}
