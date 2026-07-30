// A stand-in for the extraction pipeline that does not exist yet (ADR-033).
//
// It honours exactly the contract a real one must: dequeue, report stages,
// POST a result with the per-job token. It holds no Cosmos credential and
// knows nothing about PropertyDoc — which is the point of the contract.
//
//   node infra/stub-extractor.mjs
//
// Env: IMPORTS_CONNECTION (defaults to the Azurite dev shortcut).

import { QueueClient } from "@azure/storage-queue";

const CONNECTION = process.env.IMPORTS_CONNECTION ?? "UseDevelopmentStorage=true";
const QUEUE = "import-jobs";
const STEP_MS = Number(process.env.STUB_STEP_MS ?? 1500);

// Representative of an Idealista let, per README §10.5: 20 fields filled,
// 14 needing the owner. No English anywhere — the callback DTO has no member
// for it, so anything we sent would be discarded.
const FIXTURE = {
  listing: {
    address: "Calle de Bilbao, 12",
    postcode: "50004",
    areaEs: "Centro",
    name: "Piso luminoso en el Centro",
    type: "apartment",
    sizeM2: 78,
    bedrooms: 2,
    bathrooms: 1,
    floorNumber: 3,
    energyRating: "D",
    descriptionEs:
      "Piso exterior muy luminoso en pleno centro de Zaragoza, reformado en 2023.\n\n" +
      "A cinco minutos andando del tranvía y del mercado central.",
    detailsEs: "Calefacción central. Ascensor. Cocina office equipada.",
    bedsEs: "Un dormitorio con cama de 150 y otro con dos camas de 90.",
    // OUR vocabulary (`app/lib/amenity-icons.ts`), not a portal's words. The
    // real pipeline's job is exactly this mapping, and the API refuses
    // anything that is not `^[a-z0-9-]{1,32}$` — a fixture spelling them
    // `washingMachine`/`airConditioning` made every imported draft
    // unsaveable with `amenity_invalid` on the first Continue.
    amenities: ["wifi", "heating", "washer", "lift", "ac"],
    petsAllowed: false,
    smokingAllowed: false,
  },
  pricing: {
    priceNumber: 950,
    depositAmount: 950,
    billsPolicy: "excluded",
    minStayMonths: 1,
  },
  imported: [
    "address", "postcode", "area", "name", "type", "sizeM2", "bedrooms",
    "bathrooms", "floorNumber", "energyRating", "description", "details", "beds",
    "amenities", "petsAllowed", "smokingAllowed", "price", "depositAmount",
    "billsPolicy", "minStayMonths",
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function report(job, body) {
  const res = await fetch(job.callbackUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Import-Token": job.callbackToken },
    body: JSON.stringify(body),
  });
  console.log(`  → ${body.stage}: ${res.status}`);
  return res.status;
}

async function handle(job) {
  console.log(`job ${job.jobId} (${job.source.host})`);
  for (const stage of ["fetching", "reading", "matching"]) {
    await sleep(STEP_MS);
    await report(job, { stage });
  }
  await sleep(STEP_MS);
  // Flip to exercise the failure path:
  //   await report(job, { stage: "failed", error: { code: "login_wall" } });
  await report(job, { stage: "done", result: FIXTURE });
}

const queue = new QueueClient(CONNECTION, QUEUE);
await queue.createIfNotExists();
console.log(`stub extractor watching ${QUEUE}…`);

for (;;) {
  const { receivedMessageItems } = await queue.receiveMessages({
    numberOfMessages: 4,
    visibilityTimeout: 120,
  });
  for (const m of receivedMessageItems) {
    try {
      await handle(JSON.parse(m.messageText));
      await queue.deleteMessage(m.messageId, m.popReceipt);
    } catch (e) {
      console.error("  ✗", e.message);
    }
  }
  if (receivedMessageItems.length === 0) await sleep(2000);
}
