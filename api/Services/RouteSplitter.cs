namespace Ebrostay.Api.Services;

/// ADR-041 point 5: the boundary routes share the road once they converge.
/// Split at the fork — trunk drawn once, stubs as branches. The DOOR route
/// never reaches this class: its geometry must not exist in any output.
public static class RouteSplitter
{
    private const double Eps = 1e-6;

    private static bool Eq(GeoPoint p, GeoPoint q) =>
        Math.Abs(p.Lat - q.Lat) < Eps && Math.Abs(p.Lng - q.Lng) < Eps;

    public static (List<GeoPoint> Trunk, List<GeoPoint> StubA, List<GeoPoint> StubB)
        Split(IReadOnlyList<GeoPoint> a, IReadOnlyList<GeoPoint> b)
    {
        int i = a.Count - 1, j = b.Count - 1;
        if (a.Count == 0 || b.Count == 0 || !Eq(a[i], b[j]))
            return ([], [.. a], [.. b]);

        while (i > 0 && j > 0 && Eq(a[i - 1], b[j - 1])) { i--; j--; }

        // a[i..] == b[j..] is the shared trunk; a[i]/b[j] is the fork point,
        // kept on both stubs so the drawn lines meet.
        return (
            [.. a.Skip(i)],
            [.. a.Take(i + 1)],
            [.. b.Take(j + 1)]);
    }
}
