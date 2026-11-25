using System.Globalization;
using System.Text.Json;
using Microsoft.ML;
using Microsoft.ML.Data;

const string legacyRoute = "YYZ-CUN";
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();

var dataPath = Path.Combine(app.Environment.ContentRootPath, "Data", "fare-benchmarks.json");
using var dataStream = File.OpenRead(dataPath);
var snapshot = JsonSerializer.Deserialize<FareSnapshot>(dataStream, new JsonSerializerOptions(JsonSerializerDefaults.Web))
    ?? throw new InvalidDataException("Missing fare benchmark data.");
var benchmarks = snapshot.Routes.ToDictionary(route => route.Id, StringComparer.OrdinalIgnoreCase);

var modelPath = Path.Combine(app.Environment.ContentRootPath, "flight_model.onnx");
var mlContext = new MLContext();
var pipeline = mlContext.Transforms.ApplyOnnxModel(
    modelFile: modelPath,
    outputColumnNames: new[] { "label", "probabilities" },
    inputColumnNames: new[] { "X" });
var transformer = pipeline.Fit(mlContext.Data.LoadFromEnumerable(new List<FlightInput>()));
using var engine = mlContext.Model.CreatePredictionEngine<FlightInput, FlightPrediction>(transformer);
var engineLock = new object();

app.MapGet("/api/routes", () =>
{
    var routes = new List<object>
    {
        new { id = legacyRoute, label = "Toronto (YYZ) → Cancún (CUN)", mode = "legacy-model", periods = Array.Empty<string>() }
    };
    routes.AddRange(snapshot.Routes.Select(route => new
    {
        id = route.Id,
        label = route.Label,
        mode = "historical-benchmark",
        periods = route.Observations.Select(p => p.Period).OrderDescending().ToArray()
    }));
    return Results.Ok(routes);
});

app.MapGet("/api/benchmark", (string route, decimal price, string? period) =>
{
    if (!benchmarks.TryGetValue(route.Trim(), out var market))
        return Results.NotFound(new { error = "No historical benchmark is available for this airport pair." });
    if (price <= 0 || price > 100_000m)
        return Results.BadRequest(new { error = "Enter a positive one-way fare in USD (up to 100,000)." });

    var history = market.Observations.OrderBy(p => p.Period).ToArray();
    var selected = string.IsNullOrWhiteSpace(period)
        ? history.Last()
        : history.FirstOrDefault(p => p.Period.Equals(period.Trim(), StringComparison.OrdinalIgnoreCase));
    if (selected is null)
        return Results.NotFound(new { error = "No published fare is available for that quarter." });

    var difference = decimal.Round(price - selected.AverageFare, 2);
    return Results.Ok(new
    {
        route = market.Id,
        market.Label,
        currency = "USD",
        period = selected.Period,
        averageFare = selected.AverageFare,
        difference,
        percentageDifference = decimal.Round(100 * difference / selected.AverageFare, 1),
        history,
        snapshot.SourceUrl
    });
});

app.MapGet("/predict", (int days, int month, double price, string? route, int? destType) =>
{
    // Backward-compatible only for the original route; other routes never call this model.
    if ((route is not null && !route.Equals(legacyRoute, StringComparison.OrdinalIgnoreCase))
        || (destType.HasValue && destType != 2))
        return Results.BadRequest(new { error = "The Buy/Wait demo model supports only Toronto–Cancún." });
    if (days < 0 || days > 365 || month is < 1 or > 12 || !double.IsFinite(price) || price <= 0 || price > 100_000)
        return Results.BadRequest(new { error = "Enter a valid price, month and flight date up to 365 days out." });

    FlightPrediction prediction;
    lock (engineLock)
        prediction = engine.Predict(new FlightInput { Features = new[] { (float)days, month, 2f, (float)price } });

    string decision = prediction.PredictedLabel == 1 ? "BUY NOW" : "WAIT";
    float modelScore = prediction.Probabilities[(int)prediction.PredictedLabel];
    return Results.Ok(new
    {
        route = legacyRoute,
        decision,
        confidence = (modelScore * 100).ToString("0.0", CultureInfo.InvariantCulture) + "%",
        reasoning = "Experimental model trained on illustrative scenarios and a limited historical reference, not live fare data."
    });
});

app.Run();

internal sealed record FareSnapshot(string SourceUrl, FareMarket[] Routes);
internal sealed record FareMarket(string Id, string Label, FareQuarter[] Observations);
internal sealed record FareQuarter(string Period, decimal AverageFare);

internal sealed class FlightInput
{
    [VectorType(4)]
    [ColumnName("X")]
    public float[] Features { get; set; } = Array.Empty<float>();
}

internal sealed class FlightPrediction
{
    [ColumnName("label")]
    public long[] PredictedLabelArr { get; set; } = Array.Empty<long>();
    public long PredictedLabel => PredictedLabelArr[0];

    [ColumnName("probabilities")]
    public float[] Probabilities { get; set; } = Array.Empty<float>();
}
