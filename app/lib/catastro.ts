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

import { createThrottle, sleep } from "@/lib/throttle";
import { STREET_WORDS } from "@/lib/geocode";

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

// The Catastro publishes no rate limit, so this figure is ours, not theirs:
// the same one request a second Nominatim asks for, applied to a free
// government service we would rather not be blocked from. Its own state, not
// shared with the geocoder — two hosts, two budgets.
const claimSlot = createThrottle(1_100);

async function ask(url: string, signal?: AbortSignal): Promise<Document> {
  const wait = claimSlot();
  if (wait > 0) await sleep(wait, signal);

  const res = await fetch(url, { headers: { Accept: "application/xml" }, signal });
  if (!res.ok) throw new Error(`catastro ${res.status}`);
  return new DOMParser().parseFromString(await res.text(), "application/xml");
}

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

// ------------------------------------------------------------
// The other direction: address → reference.
//
// For the owner who does not have the IBI receipt in front of them. Two
// services, because the Catastro's street index is a closed vocabulary and
// nothing else will do:
//
//   ConsultaVia    the streets of a municipality, searched by name
//   Consulta_DNPLOC  every property at a street number
//
// The owner picks their street from the register's own list, then their flat
// from the register's own list of what is at that number. Both lists come
// from the Catastro, so there is no spelling for us to get wrong — which
// matters, because the street-type prefix is mandatory (a request without a
// `Sigla` fails outright) and there is no way to infer it from typed text:
// "César Augusto" is an avenue AND a square in Zaragoza.
// ------------------------------------------------------------

/** Ebrostay lets homes in Zaragoza city — the same fact that makes the
 *  geocoder rank the city above the province it shares a name with. Both
 *  address services demand a province and a municipality, and neither is a
 *  question worth asking an owner who is listing a flat here. */
const PROVINCE = "ZARAGOZA";
const MUNICIPALITY = "ZARAGOZA";

/** The service rejects a longer name outright (error 34). */
const MAX_STREET_QUERY = 25;

/** One street as the Catastro files it. Both halves are needed to ask about a
 *  number, and both must be the register's own strings. */
export type CadastreStreet = {
  /** "CL", "AV", "PZ", "CM"… the mandatory `Sigla`. */
  type: string;
  /** "ALFONSO I", "TORRES, DE LAS" — inverted, upper case, as stored. */
  name: string;
};

/** One property at a street number: its reference, and where in the building
 *  it is. Everything but the reference is optional — a detached house has no
 *  floor or door. */
export type CadastreUnit = {
  /** The full 20 characters, assembled from the five parts the service
   *  returns separately. */
  ref: string;
  block: string | null;
  stair: string | null;
  floor: string | null;
  door: string | null;
};

export type CadastreUnits =
  | { kind: "units"; units: CadastreUnit[] }
  /** The street exists but not that number, and the service answered with the
   *  numbers that do exist — a better thing to show than an error. Never
   *  empty: the list is often missing, and a heading over nothing reads as a
   *  bug rather than as an answer. */
  | { kind: "numbers"; numbers: string[] }
  /** No such number, and no alternatives offered. Whether the service
   *  volunteers them appears to depend on how far off the number is: Calle
   *  Alfonso I answers 5 with "1, 2, 3, 4, 6, 7, 10", and Calle Movera
   *  answers 999 with nothing at all. `ConsultaNumero` is no help — it needs
   *  a number that exists before it will list any. */
  | { kind: "noNumber" }
  | { kind: "noStreet" }
  | { kind: "none" }
  | { kind: "error" };

/**
 * Streets of Zaragoza whose name matches what was typed.
 *
 * The match is a prefix of the stored name, and the Catastro inverts articles
 * and surnames — Camino de las Torres is filed as "TORRES, DE LAS". So
 * "TORRES" finds it and "LAS TORRES" does not, which is why this is a search
 * the owner drives rather than something derived from the address field.
 */
export async function searchStreets(
  query: string,
  signal?: AbortSignal,
): Promise<CadastreStreet[]> {
  const q = query.trim().slice(0, MAX_STREET_QUERY);
  if (q.length < 3) return [];

  let doc: Document;
  try {
    doc = await ask(
      `${CALLEJERO}/ConsultaVia?Provincia=${PROVINCE}&Municipio=${MUNICIPALITY}` +
        `&TipoVia=&NombreVia=${encodeURIComponent(q)}`,
      signal,
    );
  } catch {
    return [];
  }

  return [...doc.getElementsByTagName("calle")]
    .map((el) => ({ type: text(el, "tv"), name: text(el, "nv") }))
    .filter((s): s is CadastreStreet => s.type !== null && s.name !== null);
}

/** Every property at one street number. */
export async function unitsAt(
  street: CadastreStreet,
  number: string,
  signal?: AbortSignal,
): Promise<CadastreUnits> {
  const num = number.trim();
  if (!/^\d{1,4}$/.test(num)) return { kind: "none" };

  let doc: Document;
  try {
    doc = await ask(
      `${CALLEJERO}/Consulta_DNPLOC?Provincia=${PROVINCE}&Municipio=${MUNICIPALITY}` +
        `&Sigla=${encodeURIComponent(street.type)}&Calle=${encodeURIComponent(street.name)}` +
        `&Numero=${encodeURIComponent(num)}&Bloque=&Escalera=&Planta=&Puerta=`,
      signal,
    );
  } catch {
    return { kind: "error" };
  }

  const code = text(doc, "cod");
  if (code === "43") {
    // "EL NUMERO NO EXISTE" — the response MAY carry the street's real
    // numbers, so the two outcomes are told apart here rather than left for a
    // caller to discover by rendering an empty list.
    const numbers = [
      ...new Set(
        [...doc.getElementsByTagName("nump")]
          .map((n) => text(n, "pnp"))
          .filter((n): n is string => n !== null),
      ),
    ];
    return numbers.length > 0 ? { kind: "numbers", numbers } : { kind: "noNumber" };
  }
  if (code === "33") return { kind: "noStreet" };
  if (code) return { kind: "none" };

  // One property comes back as <bico> — a whole property record — and several
  // as a <lrcdnp> list. Different documents for the same question, so both
  // shapes have to be read.
  const holders = [
    ...doc.getElementsByTagName("rcdnp"),
    ...doc.getElementsByTagName("bi"),
  ];

  const units = holders
    .map((el) => {
      const rc = el.getElementsByTagName("rc")[0];
      if (!rc) return null;
      const ref = ["pc1", "pc2", "car", "cc1", "cc2"]
        .map((part) => text(rc, part) ?? "")
        .join("");
      if (ref.length !== 20) return null;
      const inside = el.getElementsByTagName("loint")[0];
      return {
        ref,
        block: inside ? text(inside, "bq") : null,
        stair: inside ? text(inside, "es") : null,
        floor: inside ? text(inside, "pt") : null,
        door: inside ? text(inside, "pu") : null,
      };
    })
    .filter((u): u is CadastreUnit => u !== null);

  return units.length > 0 ? { kind: "units", units } : { kind: "none" };
}

/**
 * A starting point for the search box, from the address the owner already
 * typed. A guess, never an answer — the owner sees it in an editable field
 * and the register's list is what settles it.
 */
export function seedSearch(address: string): { street: string; number: string } {
  // The tail after the first comma is the owner's floor and door, which is
  // exactly what the Catastro does not file a street under.
  const head = address.split(",")[0] ?? "";
  const number = head.match(/\d{1,4}/)?.[0] ?? "";

  const street = head
    .slice(0, number ? head.indexOf(number) : undefined)
    .replace(STREET_WORDS, " ")
    // Leading articles only. "Camino de las Torres" → "Torres", which the
    // register answers; but "Virgen de Movera" keeps its middle "de", because
    // that one is stored whole.
    .replace(/^[\s,]*(?:de\s+)?(?:l[ao]s?\s+|el\s+)?/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return { street: street.slice(0, MAX_STREET_QUERY), number };
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
