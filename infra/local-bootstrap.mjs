// Create the database and containers in the LOCAL Cosmos emulator, and put the
// sample listings' photos in the LOCAL blob emulator.
//
//   COSMOS_ENDPOINT=http://localhost:8081 COSMOS_KEY=<emulator key> \
//     node infra/local-bootstrap.mjs
//
// Idempotent, and local-only by design: `seed.mjs` assumes the containers
// exist, and in Azure they are created by `main.bicep` as desired state. This
// exists so a fresh machine has the same four containers without needing the
// Bicep deployment or an Azure subscription.
//
// Shapes come from docs/spec/02-data-model.md §2.1 — partition keys
// especially: `bookingRequests` partitions on /propertyId so an owner's
// request log is a single-partition query, and getting that wrong locally
// hides the cost of getting it wrong in Azure.

import { CosmosClient } from "@azure/cosmos";
import { BlobServiceClient } from "@azure/storage-blob";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
if (!endpoint || !key) {
  console.error("COSMOS_ENDPOINT / COSMOS_KEY required");
  process.exit(1);
}

// Refuse to touch anything but a local emulator. This script creates
// containers; pointed at the real account by a stray environment variable it
// would be writing to production data (docs/spec §2.1 — the deployed
// database is provisioned by Bicep, not by a dev script).
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(endpoint)) {
  console.error(`Refusing to run against ${endpoint} — this is a local-only script.`);
  console.error("Azure containers are created by infra/main.bicep.");
  process.exit(1);
}

const databaseId = process.env.COSMOS_DATABASE ?? "ebrostay";

const CONTAINERS = [
  { id: "properties", partitionKey: "/id" },
  { id: "profiles", partitionKey: "/id" },
  { id: "bookingRequests", partitionKey: "/propertyId" },
  { id: "inquiries", partitionKey: "/id" },
  { id: "nearbyRoutes", partitionKey: "/propertyId" },
  { id: "nearbyCandidates", partitionKey: "/cell" },
  { id: "serviceBudget", partitionKey: "/id" },
  // Import jobs (ADR-033), matching main.bicep: partitioned on /id for a
  // point read by job id, seven-day TTL because a job is a transaction, not
  // a record.
  { id: "importJobs", partitionKey: "/id", defaultTtl: 604800 },
];

// The emulator serves its gateway without direct-mode replica addresses, the
// same reason local.settings.json sets COSMOS_CONNECTION_MODE=Gateway.
const client = new CosmosClient({
  endpoint,
  key,
  connectionPolicy: { connectionMode: "Gateway" },
});

const { database } = await client.databases.createIfNotExists({ id: databaseId });
console.log(`database ${database.id}`);

for (const spec of CONTAINERS) {
  const { container } = await database.containers.createIfNotExists({
    id: spec.id,
    partitionKey: { paths: [spec.partitionKey] },
    ...(spec.defaultTtl != null ? { defaultTtl: spec.defaultTtl } : {}),
  });
  const ttlNote = spec.defaultTtl != null ? `, ttl ${spec.defaultTtl}s` : "";
  console.log(`  container ${container.id}  (${spec.partitionKey}${ttlNote})`);
}

// ---------------------------------------------------------------------------
// The sample listings' photos, into Azurite.
//
// They are committed under infra/sample-photos/ rather than fetched, so a
// fresh clone works with no network and no dependency on the deployed storage
// account staying publicly readable. They are the PhotoPipeline's output, not
// the hand-uploaded originals — same three sizes and same names `seed.mjs`
// writes into each document, which is what makes the two files agree.
//
// The container is created with anonymous blob read, mirroring main.bicep's
// `publicAccess: 'Blob'`: the browser loads these straight from <img src>, so
// a private container would leave every sample home photo-less locally and
// nowhere else.

const PHOTOS_CONTAINER = "property-photos";
const photosRoot = new URL("./sample-photos/", import.meta.url).pathname;

// The well-known Azurite development connection string, same as the Functions
// host reads from AzureWebJobsStorage in api/local.settings.json.
const blobConnection =
  process.env.PHOTOS_CONNECTION ??
  process.env.AzureWebJobsStorage ??
  "UseDevelopmentStorage=true";

const blobs = BlobServiceClient.fromConnectionString(blobConnection);
if (!/127\.0\.0\.1|localhost/.test(blobs.url)) {
  console.error(`Refusing to upload to ${blobs.url} — this is a local-only script.`);
  process.exit(1);
}

const photos = blobs.getContainerClient(PHOTOS_CONTAINER);
await photos.createIfNotExists({ access: "blob" });
console.log(`\nblob container ${PHOTOS_CONTAINER}  (anonymous read)`);

let uploaded = 0;
let skipped = 0;
for (const propertyId of readdirSync(photosRoot)) {
  const dir = join(photosRoot, propertyId);
  for (const name of readdirSync(dir)) {
    const body = readFileSync(join(dir, name));
    const blob = photos.getBlockBlobClient(`${propertyId}/${name}`);
    // Idempotent by content length: these names carry a fresh key per pipeline
    // run (seed.mjs explains why), so a name that is already there with the
    // right size is already the right bytes.
    const existing = await blob.exists().then((yes) => (yes ? blob.getProperties() : null));
    if (existing?.contentLength === body.length) {
      skipped += 1;
      continue;
    }
    await blob.uploadData(body, {
      blobHTTPHeaders: { blobContentType: "image/webp" },
    });
    uploaded += 1;
  }
}
console.log(`  ${uploaded} uploaded, ${skipped} already there`);

console.log("\nNext: seed the sample listings —");
console.log("  COSMOS_ENDPOINT=$COSMOS_ENDPOINT COSMOS_KEY=$COSMOS_KEY node infra/seed.mjs");
