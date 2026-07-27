// ============================================================
// The Catastro's free public services (spec-v2 §1.1; documented in
// "Servicios web libres de la Sede Electrónica del Catastro", v2.6).
//
// Client-direct, no key, no registration — the same shape as Nominatim, and
// for the same reason: nothing here is a secret. Verified against the live
// service, including that it answers with permissive CORS.
//
// One trap worth knowing: the service returns `400 No se puede procesar su
// petición` to a request with no `User-Agent`, including for its own WSDL.
// A browser always sends one, so client-direct is the LOW-risk option here —
// calling it from a Function would mean remembering to set one by hand.
//
// This is the *datos no protegidos* tier. It answers questions about the
// PROPERTY — where it is, how big it is, what it is for, when it was built —
// and never about its owner; names need a digital certificate and a
// legitimate interest. So it can confirm a reference is real and describes a
// home at this location. It can never confirm who owns it. That job stays
// with the ownership documents (ADR-027).
//
// Nothing here is stored. A cached answer would be a second copy of a fact
// the Catastro already keeps, going stale from the moment it is written — and
// since the client is the one reporting it, a stored copy would also be a
// claim the owner could forge. The editor asks live; the review surface asks
// live. What the listing keeps is the reference, which is the question, not
// the answer.
// ============================================================

const CALLEJERO =
  "https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx";
const COORDENADAS =
  "https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx";

/** What the Catastro says about one property. Every field is optional because
 *  the record genuinely varies — a plot of land has no year of construction. */
export type CadastreRecord = {
  /** The Catastro's own one-line address, e.g.
   *  "CL SANT GABRIEL 47 Es:B Pl:BJ Pt:01 08350 ARENYS DE MAR (BARCELONA)". */
  address: string | null;
  /** Street type, name and number, without the staircase/floor/door tail. */
  street: string | null;
  postcode: string | null;
  municipality: string | null;
  /** Built surface in m² (`sfc`). Includes the share of common areas, which
   *  is why it can legitimately exceed what an owner measures inside. */
  sizeM2: number | null;
  /** "Residencial", "Comercial", "Almacén-Estacionamiento"… (`luso`). */
  use: string | null;
  /** Year of construction (`ant`). */
  year: number | null;
  /** Centroid of the PARCEL, from a second call. The parcel is the building,
   *  so this places the block, not the flat. */
  lat: number | null;
  lng: number | null;
};

export type CadastreResult =
  | { kind: "found"; record: CadastreRecord }
  /** The reference is well-formed but the Catastro has no such property. */
  | { kind: "notFound"; code: string }
  /** The service did not answer. Never fatal — every field it fills can be
   *  typed by hand. */
  | { kind: "error" };

// Same rule as the geocoder: one request a second, enforced in one place
// rather than at each call site.
let lastCallAt = 0;
const MIN_GAP_MS = 1_100;

async function ask(url: string, signal?: AbortSignal): Promise<Document> {
  const wait = Math.max(0, lastCallAt + MIN_GAP_MS - Date.now());
  if (wait > 0) await sleep(wait, signal);
  lastCallAt = Date.now();

  const res = await fetch(url, { headers: { Accept: "application/xml" }, signal });
  if (!res.ok) throw new Error(`catastro ${res.status}`);
  return new DOMParser().parseFromString(await res.text(), "application/xml");
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

const text = (doc: Document | Element, tag: string): string | null => {
  const el = doc.getElementsByTagName(tag)[0];
  const value = el?.textContent?.trim();
  return value ? value : null;
};

const number = (doc: Document | Element, tag: string): number | null => {
  const raw = text(doc, tag);
  if (raw === null) return null;
  // The service uses a comma decimal separator in some fields.
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Look up a 20-character reference, then its parcel's coordinates.
 *
 * Two calls, because they are two services: the property record does not
 * carry a position, and the coordinate service takes the 14-character PARCEL
 * reference — coordinates identify a building, and a building holds many
 * flats. The second call is best-effort: an address without a pin is still
 * worth having.
 */
export async function lookupCadastre(
  reference: string,
  signal?: AbortSignal,
): Promise<CadastreResult> {
  const ref = reference.trim().toUpperCase();
  if (!/^[A-Z0-9]{20}$/.test(ref)) return { kind: "error" };

  let doc: Document;
  try {
    doc = await ask(
      `${CALLEJERO}/Consulta_DNPRC?Provincia=&Municipio=&RC=${encodeURIComponent(ref)}`,
      signal,
    );
  } catch {
    return { kind: "error" };
  }

  const code = text(doc, "cod");
  if (code) return { kind: "notFound", code };

  const record: CadastreRecord = {
    address: text(doc, "ldt"),
    street: street(doc),
    postcode: text(doc, "dp"),
    municipality: text(doc, "nm"),
    sizeM2: number(doc, "sfc"),
    use: text(doc, "luso"),
    year: number(doc, "ant"),
    lat: null,
    lng: null,
  };

  try {
    const coords = await ask(
      `${COORDENADAS}/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:4326&RC=${encodeURIComponent(
        ref.slice(0, 14),
      )}`,
      signal,
    );
    record.lng = number(coords, "xcen");
    record.lat = number(coords, "ycen");
  } catch {
    // Leave the pin alone rather than lose the rest of the record.
  }

  return { kind: "found", record };
}

/** "CL SANT GABRIEL 47" — assembled from the structured parts rather than cut
 *  out of `ldt`, whose tail carries the staircase, floor and door. */
function street(doc: Document): string | null {
  const type = text(doc, "tv");
  const name = text(doc, "nv");
  const num = text(doc, "pnp");
  if (!name) return null;
  return [type, name, num].filter(Boolean).join(" ");
}

/** The parcel reference at a point, for the reverse direction: an owner who
 *  has placed the pin but cannot find their IBI receipt. 14 characters — the
 *  building. The owner still supplies the six that name their flat. */
export async function referenceAt(
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<{ parcel: string; address: string | null } | null> {
  try {
    const doc = await ask(
      `${COORDENADAS}/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${lng}&Coordenada_Y=${lat}`,
      signal,
    );
    const pc1 = text(doc, "pc1");
    const pc2 = text(doc, "pc2");
    if (!pc1 || !pc2) return null;
    return { parcel: pc1 + pc2, address: text(doc, "ldt") };
  } catch {
    return null;
  }
}
