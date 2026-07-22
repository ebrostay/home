// Seed the `properties` container with the 4 v1 sample homes translated to
// the v2 document shape (docs/spec-v2/02-data-model.md §2.2 / §2.7).
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

const sourcePath = process.argv[2] ?? new URL("./seed-source.json", import.meta.url).pathname;
const source = JSON.parse(readFileSync(sourcePath, "utf8"));

const BLOB = "https://ebrostayphotos.blob.core.windows.net/property-photos";
const NOW = "2026-07-22T12:00:00Z";

// Hand-tuned per-listing facts the v1 sample data doesn't carry explicitly
// (derived from its details copy).
const extra = {
  pedro1: {
    address: "Pedro II el Católico 3, Zaragoza",
    bedrooms: 3, bathrooms: 1, sizeM2: 80, selfCheckin: false,
    beds: { es: "3 camas individuales", en: "3 single beds" },
    photos: ["zaragoza-hero.webp"],
  },
  pedro2: {
    address: "Pedro II el Católico 3, Zaragoza",
    bedrooms: 3, bathrooms: 1, sizeM2: 82, selfCheckin: false,
    beds: { es: "2 camas dobles y 1 individual", en: "2 double beds and 1 single" },
    photos: ["zaragoza-hero.webp"],
  },
  movera0: {
    address: "Calle Movera 7, Zaragoza",
    bedrooms: 3, bathrooms: 1, sizeM2: 90, selfCheckin: true,
    utilitiesCapEur: 150,
    beds: { es: "3 dormitorios privados con cama doble", en: "3 private bedrooms with double beds" },
    photos: [
      "movera-second-hero.jpg", "movera-second-bedroom-1.jpg",
      "movera-second-bedroom-2.jpg", "movera-second-bedroom-3.jpg",
      "movera-second-bathroom.jpg",
    ],
  },
  movera1: {
    address: "Calle Movera 7, Zaragoza",
    bedrooms: 3, bathrooms: 1, sizeM2: 88, selfCheckin: true,
    utilitiesCapEur: 150,
    beds: { es: "3 dormitorios privados con cama doble", en: "3 private bedrooms with double beds" },
    photos: [
      "movera-first-hero.jpg", "movera-first-bedroom-1.jpg",
      "movera-first-bedroom-2.jpg", "movera-first-bathroom.jpg",
    ],
  },
};

function toDoc(p) {
  const x = extra[p.id] ?? {};
  return {
    id: p.id,
    status: "published",
    reviewNote: null,
    hostId: "seed-host",

    city: p.city ?? "zaragoza",
    type: p.type ?? "apartment",
    name: p.name?.es ?? p.id,
    addressKey: p.addressKey ?? null,
    address: x.address ?? null,
    lat: p.lat, lng: p.lng,

    area: p.area, copy: p.copy, details: p.details,
    beds: x.beds ?? null,
    priceNote: null,

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
    minStayMonths: 1,
    maxStayMonths: 12,

    rating: p.rating ?? null,
    isNew: !!p.isNew,
    checked: !!p.checked,
    depositProtected: !!p.depositProtected,
    availableFrom: p.availableFrom ?? null,

    photos: (x.photos ?? []).map((name, i) => ({
      url: `${BLOB}/${p.id}/${name}`,
      isFloorplan: false,
      sortOrder: (i + 1) * 10,
    })),

    // v1 sample "unavailable" pairs → confirmed blocks, end exclusive
    availability: (p.unavailable ?? []).map(([start, end]) => ({
      start, end, status: "confirmed", note: null, holdExpiresAt: null,
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
