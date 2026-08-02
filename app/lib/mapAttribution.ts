// What every Leaflet map on this site says in its bottom-right banner.
//
// Not translated, and deliberately: these are proper nouns and licence
// credits, and the two locale files carried the same English string anyway.
//
// The banner is the only place credit is given. A separate line of small
// print under a map repeats what the banner already carries, and it repeats
// it in a place the licence never asked for.

/** The tiles. Required by the OSM tile usage policy on every map here. */
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** The routing. Only for maps that actually DRAW an OpenRouteService answer —
 *  a line, or a figure read off one. Crediting a source a map does not use
 *  is not generosity, it is a false claim about where the data came from.
 *
 *  The host's nearby editor draws routes too but still credits them in a line
 *  of its own under the panel (`nearby.attribution`); this constant is what it
 *  would switch to. */
export const ORS_ATTRIBUTION =
  '&copy; <a href="https://openrouteservice.org/">openrouteservice</a> by <a href="https://heigit.org/">HeiGIT</a>';

/** Leaflet's own credit, minus the Ukrainian flag its default prefix carries.
 *  Leaflet takes no options object for the attribution control, so this goes
 *  on with `map.attributionControl.setPrefix(...)` after the map is built. */
export const LEAFLET_PREFIX =
  '<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>';
