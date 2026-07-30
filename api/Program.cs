using Azure.Storage.Blobs;
using Ebrostay.Api.Serialization;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

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
        // Replaces SerializerOptions/CamelCase — same camelCase mapping, plus
        // DateParseHandling.None so a stored ISO timestamp survives a read as
        // the string it is. See CosmosDateSafeSerializer for what went wrong
        // without it. (Serializer and SerializerOptions are mutually
        // exclusive; the camelCase policy moved into the serializer.)
        Serializer = new CosmosDateSafeSerializer(),
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

// Queue client. Same singleton rule as Blob and Cosmos — it pools connections.
// Falls back to AzureWebJobsStorage so a local run needs one setting, not two.
builder.Services.AddSingleton(_ =>
{
    var connection = Environment.GetEnvironmentVariable("IMPORTS_CONNECTION")
        ?? Environment.GetEnvironmentVariable("AzureWebJobsStorage")
        ?? throw new InvalidOperationException("IMPORTS_CONNECTION not set");
    return new Azure.Storage.Queues.QueueServiceClient(connection);
});

builder.Services.AddHttpClient("wakeup", c =>
{
    // Short on purpose. The ping is advisory; the queue already holds the job,
    // so waiting on an unresponsive third party would only delay the owner's
    // 202 for nothing.
    c.Timeout = TimeSpan.FromSeconds(2);
});

builder.Services.AddSingleton<Ebrostay.Api.Services.ImportQueue>();
builder.Services.AddSingleton(sp => new Ebrostay.Api.Services.ImportBudget(
    sp.GetRequiredService<Database>().GetContainer("serviceBudget")));

builder.Services.AddSingleton<Ebrostay.Api.Services.ProfileService>();
builder.Services.AddSingleton<Ebrostay.Api.Services.PlatformSettings>();
builder.Services.AddSingleton<Ebrostay.Api.Services.PhotoStore>();
builder.Services.AddSingleton<Ebrostay.Api.Services.PhotoPipeline>();

builder.Services.AddHttpClient("ors", c =>
{
    c.Timeout = TimeSpan.FromSeconds(5);
    // Required by ORS. A browser will not let us set this, which is one of the
    // three reasons this call cannot be client-direct.
    c.DefaultRequestHeaders.UserAgent.ParseAdd("ebrostay/2.0 (info@ebrostay.com)");
    // TryAddWithoutValidation, NOT Add. `Authorization` is a "known" header
    // that HttpHeaders.Add parses as AuthenticationHeaderValue ("scheme
    // credential"), but ORS's key is a bare token with no scheme — Add throws
    // FormatException while BUILDING the client, before any request is made.
    // Fixture mode (OrsClient.Fixtures) returns before factory.CreateClient
    // ("ors") is ever called, so this path went unexercised through twelve
    // tasks of fixture-mode testing until Task 13 ran with ORS_FIXTURES unset
    // for the first time. Do not "tidy" this back to .Add — it will break
    // every real ORS call again, silently, until the next real-account run.
    c.DefaultRequestHeaders.TryAddWithoutValidation("Authorization",
        Environment.GetEnvironmentVariable("ORS_API_KEY") ?? "");
});

builder.Services.AddHttpClient("overpass", c =>
{
    // The QL query itself asks Overpass for a 12s server-side timeout; this
    // client timeout must stay comfortably above that so a legitimate answer
    // arriving just under the deadline we granted is never aborted client-side.
    c.Timeout = TimeSpan.FromSeconds(15);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("ebrostay/2.0 (info@ebrostay.com)");
});

builder.Services.AddSingleton(sp => new Ebrostay.Api.Services.OrsBudget(
    sp.GetRequiredService<Database>().GetContainer("serviceBudget")));
builder.Services.AddSingleton<Ebrostay.Api.Services.OrsClient>();

builder.Services.AddSingleton(sp => new Ebrostay.Api.Services.OverpassClient(
    sp.GetRequiredService<IHttpClientFactory>(),
    sp.GetRequiredService<Database>().GetContainer("nearbyCandidates"),
    sp.GetRequiredService<ILogger<Ebrostay.Api.Services.OverpassClient>>()));
builder.Services.AddSingleton<Ebrostay.Api.Services.NearbyLookup>();

builder.Services.AddSingleton(sp => new Ebrostay.Api.Services.RouteCache(
    sp.GetRequiredService<Database>().GetContainer("nearbyRoutes"),
    sp.GetRequiredService<Ebrostay.Api.Services.OrsClient>(),
    sp.GetRequiredService<ILogger<Ebrostay.Api.Services.RouteCache>>()));

builder.Build().Run();
