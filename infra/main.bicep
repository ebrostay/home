// Ebrostay v2 infrastructure — desired state for resource group `ebrostay`.
//
//   deploy:  az deployment group create -g ebrostay -f infra/main.bicep
//   preview: az deployment group what-if -g ebrostay -f infra/main.bicep
//
// Covers: SWA (ebrostay-v2), Cosmos DB free tier + database/containers,
// photo storage + container, and the SWA app settings (secrets wired by
// reference — nothing sensitive lives in this file or in parameters).
//
// NOT covered (see infra/provision.sh + docs/spec-v2/01-architecture.md):
// GitHub secret AZURE_STATIC_WEB_APPS_API_TOKEN_V2, GoDaddy DNS, SWA role
// invitations, app/api code deploys (CI: .github/workflows/swa-v2.yml).
// Region notes (why data is spaincentral but the SWA is eastus2) are in
// ADR-021, docs/spec-v2/05-decision-log.md.

@description('Region for data resources (Cosmos, Storage).')
param dataLocation string = 'spaincentral'

@description('Region for the Static Web App (SWA offers no eligible EU region; only places the managed functions).')
param swaLocation string = 'eastus2'

param swaName string = 'ebrostay-v2'
param cosmosAccountName string = 'ebrostay-cosmos'
param databaseName string = 'ebrostay'
param storageAccountName string = 'ebrostayphotos'
param photosContainerName string = 'property-photos'

// Free tier: first 1000 RU/s + 25 GB free forever (one account/subscription).
// The database holds the full 1000 RU/s SHARED across containers => bill is 0.
// "Go paid when we get real users": raise throughput here, redeploy (ADR-019).
param sharedDatabaseThroughput int = 1000

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: cosmosAccountName
  location: dataLocation
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
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
// nothing. `/copy/*` is excluded for the same reason (rich-text editor
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
// addition of `/copy/*`) triggers a Cosmos background index transformation
// (non-disruptive, but not instant) — see ADR-028, "Consequences to watch",
// docs/spec-v2/05-decision-log.md.
var propertiesIndexingPolicy = {
  indexingMode: 'consistent'
  includedPaths: [
    { path: '/*' }
  ]
  excludedPaths: [
    { path: '/nearby/*' }
    { path: '/copy/*' }
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

// Unlinked SWA — deploys happen via deployment token from CI, no repo binding.
resource swa 'Microsoft.Web/staticSites@2023-01-01' = {
  name: swaName
  location: swaLocation
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
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
    STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net'
    PHOTOS_CONTAINER: photosContainerName
    PIPELINE_WAKEUP_URL: ''
    IMPORT_CALLBACK_BASE_URL: 'https://${swa.properties.defaultHostname}'
  }
}

output swaHostname string = swa.properties.defaultHostname
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output blobEndpoint string = storage.properties.primaryEndpoints.blob
