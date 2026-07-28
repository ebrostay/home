// ============================================================
// PLACEHOLDER CONTENT — not real data.
//
// The v2 detail design calls for a "What's nearby" panel that the API
// has no fields for (api/Models/PublicModels.cs has no neighbourhood
// data), so the UI is built against this shape and fed from here. When
// the Cosmos documents and the C# projections gain the fields, delete
// this file and read them off PropertyDetail instead — the component
// props already match.
//
// The design's host block ("Hosted by …", "Hosting since …") was removed
// on 2026-07-28: it named a person the document does not record, on a
// page a guest reads as fact. A real one needs a host profile to project
// from, and §4.3 keeps Ebrostay between guest and owner anyway, so what
// it should say is a product question rather than a missing field.
//
// Everything here is generic Zaragoza fact, deliberately NOT tied to a
// specific listing: nothing in this file should read as a claim about a
// real property or a real person.
// ============================================================

export type NearbyItem = {
  name: string;
  detail: string;
  minutes: number;
  km: number;
};

export type NearbyCategory = {
  key: "transport" | "groceries" | "food" | "outdoors" | "health";
  items: NearbyItem[];
};

// Real Zaragoza landmarks, indicative distances. These are city facts, not
// per-property measurements — the times assume a central starting point and
// must be recomputed per listing once coordinates drive them.
export const PLACEHOLDER_NEARBY: NearbyCategory[] = [
  {
    key: "transport",
    items: [
      { name: "Tranvía L1", detail: "Plaza España", minutes: 4, km: 0.3 },
      { name: "Bus Ci1 / 22", detail: "Coso", minutes: 3, km: 0.2 },
      { name: "Bizi", detail: "Bike share", minutes: 2, km: 0.1 },
      { name: "Zaragoza-Delicias", detail: "AVE", minutes: 18, km: 3.1 },
    ],
  },
  {
    key: "groceries",
    items: [
      { name: "Mercado Central", detail: "Fresh market", minutes: 7, km: 0.6 },
      { name: "Mercadona", detail: "Supermarket", minutes: 5, km: 0.4 },
      { name: "Puerto Venecia", detail: "Shopping centre", minutes: 22, km: 7.4 },
    ],
  },
  {
    key: "food",
    items: [
      { name: "El Tubo", detail: "Tapas quarter", minutes: 4, km: 0.3 },
      { name: "Casa Lac", detail: "★ 4.6", minutes: 6, km: 0.5 },
      { name: "Los Xarmientos", detail: "★ 4.5", minutes: 11, km: 1.2 },
    ],
  },
  {
    key: "outdoors",
    items: [
      { name: "Riberas del Ebro", detail: "River walk", minutes: 6, km: 0.5 },
      { name: "Parque Grande Labordeta", detail: "City park", minutes: 16, km: 2.2 },
      { name: "CN Helios", detail: "Sports club", minutes: 14, km: 1.9 },
    ],
  },
  {
    key: "health",
    items: [
      { name: "Farmacia Coso", detail: "24 h", minutes: 3, km: 0.2 },
      { name: "Centro de Salud Rebolería", detail: "GP", minutes: 8, km: 0.7 },
      { name: "Hospital Clínico Lozano Blesa", detail: "A&E", minutes: 15, km: 3.4 },
    ],
  },
];
