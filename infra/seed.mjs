// Seed the `properties` container with the 4 v1 sample homes translated to
// the v2 document shape (docs/spec/02-data-model.md §2.2 / §2.7).
// Photos were uploaded to Blob under {propertyId}/… beforehand.
//
//   COSMOS_ENDPOINT=… COSMOS_KEY=… node infra/seed.mjs [path/to/v1-resolved.json]
//
// Idempotent: upserts by id.

import { CosmosClient } from "@azure/cosmos";
import { readFileSync } from "node:fs";

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
if (!endpoint || !key) {
  console.error("COSMOS_ENDPOINT / COSMOS_KEY required");
  process.exit(1);
}

// Refuse to run against anything but the local emulator, unless explicitly
// overridden — the same rule `local-bootstrap.mjs` applies to container
// creation, and a more urgent one here: this script now writes `description` as a
// ProseMirror JSON document (`BilingualDoc`), a shape the pre-ADR-032 API
// cannot read at all (docs/spec/05-decision-log.md, "Legacy plain-string
// `description` throws, not degrades" — it takes the whole public listings response
// down, not just one page). Run this against the wrong database and it is
// not adding harmless test data; it is overwriting real listings' `description`
// into a shape that outage-level breaks the site for anyone still running
// the old API. The one legitimate exception is the deliberate staging
// re-seed that same decision requires before the new API ships — it must
// opt in explicitly with SEED_ALLOW_REMOTE=1 rather than rely on this guard
// simply not being here.
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(endpoint);
if (!local && process.env.SEED_ALLOW_REMOTE !== "1") {
  console.error(`Refusing to run against ${endpoint} — this is not a local emulator endpoint.`);
  console.error("If this is a deliberate staging re-seed (ADR-032), set SEED_ALLOW_REMOTE=1.");
  process.exit(1);
}

const sourcePath = process.argv[2] ?? new URL("./seed-source.json", import.meta.url).pathname;
const source = JSON.parse(readFileSync(sourcePath, "utf8"));

// Where the photo URLs written into each document point. It follows the
// database being seeded: a local run gets Azurite, which `local-bootstrap.mjs`
// fills from infra/sample-photos/ under exactly these names. Pointing local
// documents at the deployed account instead — which is what this did until
// 2026-07-31 — makes a local stack need the internet, and quietly need that
// container to stay publicly readable, to show a sample home's photos.
//
// Azurite's well-known development account. 127.0.0.1 rather than localhost so
// the URL is stable whichever the browser resolves first.
const AZURITE = "http://127.0.0.1:10000/devstoreaccount1/property-photos";
const BLOB =
  process.env.PHOTOS_BASE_URL ??
  (local ? AZURITE : "https://ebrostayphotos.blob.core.windows.net/property-photos");

// Who owns the seeded listings. The default is a placeholder that matches no
// real principal, so the sample homes are public but belong to nobody. To see
// them on the owner portfolio locally, re-seed with your own principal id —
// the SWA emulator hashes provider+username into one, readable at /api/me:
//   SEED_HOST_ID=$(curl -s localhost:4280/api/me | jq -r .userId) node infra/seed.mjs
const HOST_ID = process.env.SEED_HOST_ID ?? "seed-host";
const NOW = "2026-07-22T12:00:00Z";

// Hand-tuned per-listing facts the v1 sample data doesn't carry explicitly
// (derived from its details copy).
const extra = {
  pedro1: {
    reference: "EBR-P-0101",
    address: "Pedro II el Católico 3, Zaragoza",
    postcode: "50009",
    bedrooms: 3, bathrooms: 1, sizeM2: 80, selfCheckin: false,
    stayTerms: ["cancellation"],
    beds: { es: "3 camas individuales", en: "3 single beds" },
    photos: [
      { key: "29d65ea45a9f473da010664f7d885955", source: "zaragoza-hero.webp" },
    ],
  },
  pedro2: {
    reference: "EBR-P-0102",
    address: "Pedro II el Católico 3, Zaragoza",
    postcode: "50009",
    bedrooms: 3, bathrooms: 1, sizeM2: 82, selfCheckin: false,
    stayTerms: ["cancellation"],
    beds: { es: "2 camas dobles y 1 individual", en: "2 double beds and 1 single" },
    photos: [
      { key: "d15f2fd6e540451189f03e2bbc9b1f44", source: "zaragoza-hero.webp" },
    ],
  },
  movera0: {
    reference: "EBR-P-0201",
    address: "Calle Movera 7, Zaragoza",
    postcode: "50194",
    bedrooms: 3, bathrooms: 1, sizeM2: 90, selfCheckin: true,
    utilitiesCapEur: 150,
    stayTerms: ["cancellation", "cleaning"],
    beds: { es: "3 dormitorios privados con cama doble", en: "3 private bedrooms with double beds" },
    photos: [
      { key: "a9f6095c76804984aeb56122c48a16f6", source: "movera-second-hero.jpg" },
      { key: "1cddfcda57bf4650bae409d3af769bdf", source: "movera-second-bedroom-1.jpg" },
      { key: "4f7c53c60f9547819ddd817ff2e46289", source: "movera-second-bedroom-2.jpg" },
      { key: "30fb648d21cc4a11860abef09f970d2b", source: "movera-second-bedroom-3.jpg" },
      { key: "73bc3bf52e0c404b8fe98d6d65175357", source: "movera-second-bathroom.jpg" },
    ],
  },
  movera1: {
    reference: "EBR-P-0202",
    address: "Calle Movera 7, Zaragoza",
    postcode: "50194",
    bedrooms: 3, bathrooms: 1, sizeM2: 88, selfCheckin: true,
    utilitiesCapEur: 150,
    stayTerms: ["cancellation"],
    beds: { es: "3 dormitorios privados con cama doble", en: "3 private bedrooms with double beds" },
    photos: [
      { key: "c2a28cc5f9784bc0a00fc6963673d1c4", source: "movera-first-hero.jpg" },
      { key: "fdb673543425407fba309bd796374a5d", source: "movera-first-bedroom-1.jpg" },
      { key: "d7aa78a70c5d47e5aae2af7388e405d3", source: "movera-first-bedroom-2.jpg" },
      { key: "3a41eda7efd54350a609b632d1c191c1", source: "movera-first-bathroom.jpg" },
    ],
  },
};

function toDoc(p) {
  const x = extra[p.id] ?? {};
  return {
    id: p.id,
    status: "published",
    reviewNote: null,
    hostId: HOST_ID,
    // Grouped by building: 01xx Pedro II, 02xx Movera.
    reference: x.reference ?? null,

    city: p.city ?? "zaragoza",
    type: p.type ?? "apartment",
    name: p.name?.es ?? p.id,
    addressKey: p.addressKey ?? null,
    address: x.address ?? null,
    postcode: x.postcode ?? null,
    // Left null on purpose: a made-up Catastro reference in seed data is the
    // kind of plausible-looking value that survives into a screenshot.
    cadastralRef: null,
    lat: p.lat, lng: p.lng,

    area: p.area, description: p.description, details: p.details,
    // Embedded "what's nearby" entries (§2.2.5, ADR-028). Passed through as-is
    // — the shape in seed-source.json already matches `NearbyEntry` exactly,
    // camelCase field for field, so there is nothing to transform.
    nearby: p.nearby ?? [],
    beds: x.beds ?? null,
    priceNote: null,
    // The v1 English copy was published and read for two years, so it is
    // approved by every meaning of the word (ADR-027).
    descriptionEnApproved: true,

    guests: p.guests ?? 4,
    bedrooms: x.bedrooms ?? 3,
    bathrooms: x.bathrooms ?? 1,
    sizeM2: x.sizeM2 ?? 80,
    floorNumber: p.floorNumber ?? null,
    amenities: p.amenities ?? [],
    energyRating: null,
    petsAllowed: false,
    smokingAllowed: false,
    couplesAllowed: true,
    selfCheckin: x.selfCheckin ?? false,
    videoUrl: null,

    priceNumber: p.priceNumber,
    priceLabel: `${p.priceNumber} EUR`,
    depositAmount: p.priceNumber,
    upfrontRentEur: p.priceNumber,
    billsPolicy: p.billsPolicy ?? "excluded",
    utilitiesCapEur: x.utilitiesCapEur ?? null,
    // ADR-026. Everything starts on the platform arrangement: a real owner
    // opting to clean their own flat is a decision they make, not a default
    // the seed should invent for them.
    cleaningBy: x.cleaningBy ?? "platform",
    cleaningFeeEur: x.cleaningFeeEur ?? null,
    turnoverDays: x.turnoverDays ?? 3,
    minStayMonths: 1,
    // 11, not 12: ADR-022 caps a stay under 365 days, and 12 calendar months
    // is 365 on the nose — the booking panel already refuses to offer it.
    maxStayMonths: 11,
    // Only the terms nothing else in the doc implies; bills and deposit terms
    // are derived from billsPolicy / depositAmount (ADR-023).
    stayTerms: x.stayTerms ?? [],

    isNew: !!p.isNew,
    checked: !!p.checked,
    depositProtected: !!p.depositProtected,
    availableFrom: p.availableFrom ?? null,

    // The three sizes `PhotoPipeline` produces, named the way the upload
    // endpoint names them: one `key` shared by the variants of one photo.
    // These are NOT the hand-uploaded originals — those are still in the
    // container under their own names and are the SOURCE this was derived
    // from, but nothing serves them: a photo carrying only `url` makes
    // `app/lib/photos.ts` emit no srcset at all, so every search card
    // downloaded a full-size image.
    //
    // Regenerating: run the re-encode harness over the originals named in
    // `source` and paste the new keys here. It cannot be done from this file
    // alone — the pipeline is C# (SkiaSharp), and re-deriving it in Node
    // would be a second implementation that drifts. New keys each run, on
    // purpose: blobs are served `immutable, max-age=31536000`, so a reused
    // name would leave caches on last run's bytes for a year.
    photos: (x.photos ?? []).map((ph, i) => ({
      url: `${BLOB}/${p.id}/${ph.key}-full.webp`,
      cardUrl: `${BLOB}/${p.id}/${ph.key}-card.webp`,
      detailUrl: `${BLOB}/${p.id}/${ph.key}-detail.webp`,
      isFloorplan: false,
      sortOrder: (i + 1) * 10,
    })),

    // v1 sample "unavailable" pairs → confirmed blocks, end exclusive
    availability: (p.unavailable ?? []).map(([start, end]) => ({
      start, end, status: "confirmed", note: null, holdExpiresAt: null,
      // Admin-set per stay; null means "use the listing's turnoverDays".
      turnoverDaysOverride: null,
    })),

    createdAt: NOW,
    updatedAt: NOW,
  };
}

const client = new CosmosClient({ endpoint, key });
const container = client.database(process.env.COSMOS_DATABASE ?? "ebrostay").container("properties");

for (const p of source) {
  const doc = toDoc(p);
  await container.items.upsert(doc);
  console.log(`upserted ${doc.id} (${doc.photos.length} photos, ${doc.availability.length} blocks)`);
}
console.log("seed complete");
