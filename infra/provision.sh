#!/usr/bin/env bash
# One-time Azure provisioning for Ebrostay v2 — captured from the commands
# actually run on 2026-07-19. Safe to re-run (creates are idempotent-ish; they
# fail harmlessly or no-op when the resource already exists).
#
# Notes:
# - westeurope was NOT accepting new resources ("location ineligible") at
#   provisioning time, so data lives in spaincentral (Madrid — closest to
#   Zaragoza anyway).
# - The Static Web App is the REUSED v1 resource `ebrostay-home` (Free tier,
#   westeurope, host thankful-sea-0e236161e.7.azurestaticapps.net): SWA only
#   offers westeurope in Europe and existing resources are grandfathered.
#   Its deployment token is stored as the GitHub Actions secret
#   AZURE_STATIC_WEB_APPS_API_TOKEN_V2 (see .github/workflows/swa-v2.yml).
#   The old v1 workflow ("Azure Static Web Apps CI/CD" on main) is DISABLED in
#   GitHub so pushes to main can no longer deploy v1 over v2.
set -euo pipefail

RG=ebrostay
LOC=spaincentral
COSMOS=ebrostay-cosmos
DB=ebrostay
STORAGE=ebrostayphotos

az provider register -n Microsoft.Storage --wait
az provider register -n Microsoft.DocumentDB --wait

# --- Cosmos DB (serverless, NoSQL) -----------------------------------------
az cosmosdb create -n "$COSMOS" -g "$RG" \
  --locations regionName="$LOC" --capabilities EnableServerless

az cosmosdb sql database create -a "$COSMOS" -g "$RG" -n "$DB"

az cosmosdb sql container create -a "$COSMOS" -g "$RG" -d "$DB" \
  -n properties --partition-key-path /id
az cosmosdb sql container create -a "$COSMOS" -g "$RG" -d "$DB" \
  -n profiles --partition-key-path /id
az cosmosdb sql container create -a "$COSMOS" -g "$RG" -d "$DB" \
  -n bookingRequests --partition-key-path /propertyId
az cosmosdb sql container create -a "$COSMOS" -g "$RG" -d "$DB" \
  -n inquiries --partition-key-path /id

# --- Blob storage for property photos --------------------------------------
az storage account create -n "$STORAGE" -g "$RG" -l "$LOC" \
  --sku Standard_LRS --kind StorageV2 \
  --allow-blob-public-access true --min-tls-version TLS1_2

az storage container create --account-name "$STORAGE" \
  -n property-photos --public-access blob --auth-mode login

# --- Deployment token → GitHub secret (manual step reference) --------------
# az staticwebapp secrets list -n ebrostay-home -g "$RG" \
#   --query properties.apiKey -o tsv \
#   | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN_V2 --repo ebrostay/home --body -
