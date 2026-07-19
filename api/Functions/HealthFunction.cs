using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace Ebrostay.Api.Functions;

public class HealthFunction
{
    [Function("Health")]
    public IActionResult Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "health")] HttpRequest req)
        => new OkObjectResult(new { status = "ok", service = "ebrostay-api" });
}
