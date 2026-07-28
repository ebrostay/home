// Create the database and containers in the LOCAL Cosmos emulator.
//
//   COSMOS_ENDPOINT=http://localhost:8081 COSMOS_KEY=<emulator key> \
//     node infra/local-bootstrap.mjs
//
// Idempotent, and local-only by design: `seed.mjs` assumes the containers
// exist, and in Azure they are created by `main.bicep` as desired state. This
// exists so a fresh machine has the same four containers without needing the
// Bicep deployment or an Azure subscription.
//
// Shapes come from docs/spec-v2/02-data-model.md §2.1 — partition keys
// especially: `bookingRequests` partitions on /propertyId so an owner's
// request log is a single-partition query, and getting that wrong locally
// hides the cost of getting it wrong in Azure.

import { CosmosClient } from "@azure/cosmos";

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
if (!endpoint || !key) {
  console.error("COSMOS_ENDPOINT / COSMOS_KEY required");
  process.exit(1);
}

// Refuse to touch anything but a local emulator. This script creates
// containers; pointed at the real account by a stray environment variable it
// would be writing to production data (docs/spec-v2 §2.1 — the deployed
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
  });
  console.log(`  container ${container.id}  (${spec.partitionKey})`);
}

console.log("\nNext: seed the sample listings —");
console.log("  COSMOS_ENDPOINT=$COSMOS_ENDPOINT COSMOS_KEY=$COSMOS_KEY node infra/seed.mjs");
