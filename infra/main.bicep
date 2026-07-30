// Ebrostay v2 infrastructure — desired state for resource group `ebrostay`.
//
//   preview: az deployment group what-if -g ebrostay -f infra/main.bicep \
//              -p orsApiKey="$ORS_KEY"
//   deploy:  az deployment group create  -g ebrostay -f infra/main.bicep \
//              -p orsApiKey="$ORS_KEY"
//
// ⚠️ `swaAppSettings` is a WHOLE-COLLECTION PUT: any app setting that exists on
// the SWA but is absent from this template is DELETED by the deployment. Before
// deploying, diff the live settings against this file and add anything missing
// as a parameter — do not assume this file is complete:
//
//   az staticwebapp appsettings list -n ebrostay-v2 -g ebrostay \
//     --query "properties" -o json | jq -r 'keys[]'
//
// That is also where the current ORS key comes from; it has never lived here.
//
// Covers: Cosmos DB free tier + database/containers, photo storage + container,
// the import queue, and the SWA's app settings (secrets wired by reference —
// nothing sensitive lives in this file or in parameters). The SWA RESOURCE
// itself is referenced, not managed — see the `swa` resource below for why.
//
// NOT covered (see infra/provision.sh + docs/spec-v2/01-architecture.md):
// GitHub secret AZURE_STATIC_WEB_APPS_API_TOKEN_V2, GoDaddy DNS, SWA role
// invitations, app/api code deploys (CI: .github/workflows/swa-v2.yml).
// Region notes (why data is spaincentral but the SWA is eastus2) are in
// ADR-021, docs/spec-v2/05-decision-log.md.

@description('Region for data resources (Cosmos, Storage).')
param dataLocation string = 'spaincentral'

// The SWA's own region (eastus2 — SWA offers no eligible EU region, and the
// region only places the managed functions) is not a parameter here: the SWA is
// referenced, not managed. See the `swa` resource below and ADR-021.
param swaName string = 'ebrostay-v2'
param cosmosAccountName string = 'ebrostay-cosmos'
param databaseName string = 'ebrostay'
param storageAccountName string = 'ebrostayphotos'
param photosContainerName string = 'property-photos'

// Free tier: first 1000 RU/s + 25 GB free forever (one account/subscription).
// The database holds the full 1000 RU/s SHARED across containers => bill is 0.
// "Go paid when we get real users": raise throughput here, redeploy (ADR-019).
param sharedDatabaseThroughput int = 1000

// OpenRouteService key for the nearby-routing calls (api/Program.cs reads
// ORS_API_KEY). Deliberately REQUIRED and without a default: `swaAppSettings`
// below is a whole-collection PUT, so every setting absent from it is DELETED
// from the SWA on deploy. This key has never been in this file — it was set by
// hand — which means every deployment of this template before now would have
// silently wiped it and broken every route measurement on the site. A required
// parameter turns that silent wipe into a deployment that refuses to start.
// Read the current value out before deploying (see the header comment).
@description('OpenRouteService API key. Never stored in this file or in a parameters file — pass it at deploy time.')
@secure()
param orsApiKey string

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: dataLocation
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    // Both of these are LIVE on the account and absent from this template until
    // now, which meant a deploy would have silently turned automatic failover
    // off and dropped the TLS floor. Declared so the template preserves them
    // rather than regressing them (`az deployment group what-if` showed both).
    enableAutomaticFailover: true
    minimalTlsVersion: 'Tls12'
    locations: [
      {
        locationName: dataLocation
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
    options: {
      throughput: sharedDatabaseThroughput
    }
  }
}

// `properties` never queries on the embedded Nearby array (§2.2 / task-2 of
// the "What's nearby" plan), so it is excluded from indexing here — every
// owner save would otherwise pay to index up to 24 embedded entries for
// nothing. `/description/*` is excluded for the same reason (rich-text editor
// design doc §5.1, ADR-032): nothing ever queries into the description
// document tree, and every save would otherwise index the whole thing.
// /photos/* and /availability/* are almost certainly in the same position
// but are pre-existing and out of scope for this change. `_etag` is also
// excluded to match Cosmos's implicit default policy (the one in effect
// before this explicit policy existed) — otherwise it would start being
// indexed for no benefit.
//
// This is the first explicit indexingPolicy ever applied to `properties`,
// which is live and populated. Deploying it (including this round's
// addition of `/description/*`) triggers a Cosmos background index transformation
// (non-disruptive, but not instant) — see ADR-028, "Consequences to watch",
// docs/spec-v2/05-decision-log.md.
var propertiesIndexingPolicy = {
  indexingMode: 'consistent'
  includedPaths: [
    { path: '/*' }
  ]
  excludedPaths: [
    { path: '/nearby/*' }
    { path: '/description/*' }
    { path: '/"_etag"/?' }
  ]
}

// Route geometry is looked up only by its point id (id == "{entryId}-{profile}")
// within a property's partition; nothing ever queries the polyline/metres/
// seconds fields, so only the partition key is indexed.
var nearbyRoutesIndexingPolicy = {
  indexingMode: 'consistent'
  includedPaths: [
    { path: '/propertyId/?' }
  ]
  excludedPaths: [
    { path: '/*' }
  ]
}

var containers = [
  { name: 'properties', partitionKey: '/id', defaultTtl: null, indexingPolicy: propertiesIndexingPolicy }
  { name: 'profiles', partitionKey: '/id', defaultTtl: null, indexingPolicy: null }
  { name: 'bookingRequests', partitionKey: '/propertyId', defaultTtl: null, indexingPolicy: null }
  { name: 'inquiries', partitionKey: '/id', defaultTtl: null, indexingPolicy: null }
  // POIs do not move; cached Overpass answers per rounded cell + group.
  { name: 'nearbyCandidates', partitionKey: '/cell', defaultTtl: 2592000, indexingPolicy: null }
  // Encoded route geometry, kept separate from `properties` so an anonymous
  // guest's lazy route fetch can never race the owner's save of the listing.
  { name: 'nearbyRoutes', partitionKey: '/propertyId', defaultTtl: 15552000, indexingPolicy: nearbyRoutesIndexingPolicy }
  // Cross-instance daily call budget for the ORS matrix (Consumption plan
  // scales out, so an in-process counter would not be a limit at all).
  { name: 'serviceBudget', partitionKey: '/id', defaultTtl: 172800, indexingPolicy: null }
  // Import jobs (ADR-033). Partitioned on /id: the only access pattern is a
  // point read by job id, which is what makes a 2s poll cost 1 RU. Seven-day
  // TTL — a job is a transaction, not a record.
  { name: 'importJobs', partitionKey: '/id', defaultTtl: 604800, indexingPolicy: null }
]

resource sqlContainers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [
  for c in containers: {
    parent: database
    name: c.name
    properties: {
      resource: union(
        {
          id: c.name
          partitionKey: {
            paths: [c.partitionKey]
            kind: 'Hash'
          }
        },
        c.defaultTtl == null ? {} : { defaultTtl: c.defaultTtl },
        c.indexingPolicy == null ? {} : { indexingPolicy: c.indexingPolicy }
      )
    }
  }
]

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: dataLocation
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

resource photosContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: photosContainerName
  properties: {
    publicAccess: 'Blob'
  }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

resource importQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  parent: queueService
  name: 'import-jobs'
}

// One account, two roles (photo blobs and the import queue), so one connection
// string built once and handed to both settings below.
var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net'

// REFERENCED, NOT MANAGED. The SWA resource itself is provisioned and wired by
// hand (infra/provision.sh) and its GitHub binding — repositoryUrl
// `ebrostay/home`, branch `redesign/v2`, provider GitHub — plus the deployment
// token in the AZURE_STATIC_WEB_APPS_API_TOKEN_V2 GitHub secret live entirely
// outside this template.
//
// It used to be declared here as a managed resource carrying only
// `allowConfigFileUpdates`/`stagingEnvironmentPolicy` and the comment "unlinked
// SWA … no repo binding". That comment was simply wrong about the live resource,
// and `what-if` proved the cost: deploying would have nulled repositoryUrl,
// branch and provider, unbinding the SWA from the repository that deploys to it.
// Declaring it `existing` means this template reads its hostname and attaches
// app settings without ever rewriting the resource. If the SWA ever does become
// bicep-managed, the binding properties must be declared here first.
resource swa 'Microsoft.Web/staticSites@2023-01-01' existing = {
  name: swaName
}

// App settings for the managed functions; secrets referenced at deploy time,
// so key rotation = rerun this deployment.
resource swaAppSettings 'Microsoft.Web/staticSites/config@2023-01-01' = {
  parent: swa
  name: 'appsettings'
  properties: {
    COSMOS_ENDPOINT: cosmos.properties.documentEndpoint
    COSMOS_KEY: cosmos.listKeys().primaryMasterKey
    COSMOS_DATABASE: databaseName
    // The names the CODE reads (api/Program.cs), not a third name of our own.
    // `STORAGE_CONNECTION_STRING` used to be the only storage setting here and
    // nothing has ever read it: the blob client reads PHOTOS_CONNECTION and the
    // queue client reads IMPORTS_CONNECTION, each falling back to
    // AzureWebJobsStorage — which SWA managed functions do not expose either.
    // Applied as it stood, the QueueServiceClient singleton threw at DI
    // resolution and every /api/import answered 500.
    PHOTOS_CONNECTION: storageConnectionString
    IMPORTS_CONNECTION: storageConnectionString
    PHOTOS_CONTAINER: photosContainerName
    ORS_API_KEY: orsApiKey
    PIPELINE_WAKEUP_URL: ''
    IMPORT_CALLBACK_BASE_URL: 'https://${swa.properties.defaultHostname}'
  }
}

output swaHostname string = swa.properties.defaultHostname
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output blobEndpoint string = storage.properties.primaryEndpoints.blob
