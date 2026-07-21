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

    return new CosmosClient(endpoint, key, new CosmosClientOptions
    {
        SerializerOptions = new CosmosSerializationOptions
        {
            PropertyNamingPolicy = CosmosPropertyNamingPolicy.CamelCase,
        },
        MaxRetryAttemptsOnRateLimitedRequests = 5,
    });
});

builder.Services.AddSingleton(sp =>
{
    var database = Environment.GetEnvironmentVariable("COSMOS_DATABASE") ?? "ebrostay";
    return sp.GetRequiredService<CosmosClient>().GetDatabase(database);
});

builder.Build().Run();
