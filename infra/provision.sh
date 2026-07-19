#!/usr/bin/env bash
# One-time Azure provisioning for Ebrostay v2 — captured from the commands
# actually run on 2026-07-19. Safe to re-run (creates are idempotent-ish; they
# fail harmlessly or no-op when the resource already exists).
#
# Notes:
# - westeurope was NOT accepting new resources ("location ineligible") at
#   provisioning time, so data lives in spaincentral (Madrid — closest to
#   Zaragoza anyway) and the SWA in eastus2 (SWA's region only places the
#   managed functions; static content is globally distributed).
# - The Static Web App is a FRESH resource `ebrostay-v2` (Free tier, eastus2,
#   host gentle-plant-000592f0f.7.azurestaticapps.net). Reusing the v1 SWA
#   `ebrostay-home` was attempted and abandoned: it rejects all deployment
#   tokens ("No matching Static Web App was found or the api key was invalid"),
#   even freshly reset ones. It still serves a stale v1 deploy and can be
#   deleted at cutover together with its GitHub linkage.
#   The v2 deployment token is stored as the GitHub Actions secret
#   AZURE_STATIC_WEB_APPS_API_TOKEN_V2 (see .github/workflows/swa-v2.yml).
#   The old v1 workflow ("Azure Static Web Apps CI/CD" on main) is DISABLED in
#   GitHub so pushes to main can no longer deploy v1 anywhere.
# - Deploy recipe that works (CI mirrors it): prebuild Next (app/out) and
#   `dotnet publish api -c Release -o api/bin/publish`, then upload both with
#   skip_app_build + skip_api_build; apiRuntime dotnet-isolated:9.0 comes from
#   staticwebapp.config.json. CLI equivalent:
#   swa deploy app/out --api-location api/bin/publish \
#     --api-language dotnetisolated --api-version 9.0 \
#     --deployment-token <token> --env production
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
