using Azure.Storage.Blobs;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

// Singleton CosmosClient (skill: sdk-singleton-client). camelCase so C#
// PascalCase properties map onto the spec-v2 document shape.
builder.Services.AddSingleton(_ =>
{
    var endpoint = Environment.GetEnvironmentVariable("COSMOS_ENDPOINT")
        ?? throw new InvalidOperationException("COSMOS_ENDPOINT not set");
    var key = Environment.GetEnvironmentVariable("COSMOS_KEY")
        ?? throw new InvalidOperationException("COSMOS_KEY not set");

    // The local emulator's gateway does not serve direct-mode replica addresses,
    // so local.settings.json sets COSMOS_CONNECTION_MODE=Gateway. Azure is left
    // on the SDK default (Direct).
    var gateway = string.Equals(
        Environment.GetEnvironmentVariable("COSMOS_CONNECTION_MODE"),
        "Gateway",
        StringComparison.OrdinalIgnoreCase);

    return new CosmosClient(endpoint, key, new CosmosClientOptions
    {
        SerializerOptions = new CosmosSerializationOptions
        {
            PropertyNamingPolicy = CosmosPropertyNamingPolicy.CamelCase,
        },
        MaxRetryAttemptsOnRateLimitedRequests = 5,
        ConnectionMode = gateway ? ConnectionMode.Gateway : ConnectionMode.Direct,
    });
});

builder.Services.AddSingleton(sp =>
{
    var database = Environment.GetEnvironmentVariable("COSMOS_DATABASE") ?? "ebrostay";
    return sp.GetRequiredService<CosmosClient>().GetDatabase(database);
});

// Photo storage (§2.6). Same singleton rule as Cosmos — the client pools
// connections, and one per request exhausts sockets under any real load.
// Falls back to AzureWebJobsStorage so a local run needs one setting, not two.
builder.Services.AddSingleton(_ =>
{
    var connection = Environment.GetEnvironmentVariable("PHOTOS_CONNECTION")
        ?? Environment.GetEnvironmentVariable("AzureWebJobsStorage")
        ?? throw new InvalidOperationException("PHOTOS_CONNECTION not set");
    return new BlobServiceClient(connection);
});

builder.Services.AddSingleton<Ebrostay.Api.Services.ProfileService>();
builder.Services.AddSingleton<Ebrostay.Api.Services.PlatformSettings>();
builder.Services.AddSingleton<Ebrostay.Api.Services.PhotoStore>();
builder.Services.AddSingleton<Ebrostay.Api.Services.PhotoPipeline>();

builder.Build().Run();
