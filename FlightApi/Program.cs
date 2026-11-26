using System.Globalization;
using System.IO.Compression;
using System.Text.Json;
using Microsoft.ML;
using Microsoft.ML.Data;

const string legacyRoute = "YYZ-CUN";
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.UseDefaultFiles();
app.UseStaticFiles();

const string airportSource = "https://catalog.data.gov/dataset/consumer-airfare-report-table-1a-all-u-s-airport-pair-markets";
const string citySource = "https://data.transportation.gov/d/yj5y-b2ir";
var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
var markets = new[] { ("airport", airportSource), ("city", citySource) }
    .SelectMany(source =>
    {
        var path = Path.Combine(app.Environment.ContentRootPath, "Data", $"{source.Item1}-fares.json.gz");
        using var file = File.OpenRead(path);
        using var stream = new GZipStream(file, CompressionMode.Decompress);
        return (JsonSerializer.Deserialize<FareMarket[]>(stream, options)
            ?? throw new InvalidDataException($"Missing {source.Item1} benchmark data."))
            .Select(market => (Market: market, Scope: source.Item1, Source: source.Item2));
    }).ToArray();
var benchmarks = markets.ToDictionary(entry => entry.Market.Id, StringComparer.OrdinalIgnoreCase);
var legacy = new { id = legacyRoute, label = "Toronto (YYZ) → Cancún (CUN)", mode = "legacy-model", scope = "demo", periods = Array.Empty<string>() };
var catalog = markets.Select(entry => new
{
    id = entry.Market.Id,
    label = entry.Market.Label,
    mode = "historical-benchmark",
    scope = entry.Scope,
    periods = entry.Market.Observations.Select(p => p.Period).Reverse().ToArray()
}).OrderBy(route => route.label, StringComparer.OrdinalIgnoreCase).Prepend(legacy).ToArray();

var modelPath = Path.Combine(app.Environment.ContentRootPath, "flight_model.onnx");
var mlContext = new MLContext();
var pipeline = mlContext.Transforms.ApplyOnnxModel(
    modelFile: modelPath,
    outputColumnNames: new[] { "label", "probabilities" },
    inputColumnNames: new[] { "X" });
var transformer = pipeline.Fit(mlContext.Data.LoadFromEnumerable(new List<FlightInput>()));
using var engine = mlContext.Model.CreatePredictionEngine<FlightInput, FlightPrediction>(transformer);
var engineLock = new object();

app.MapGet("/api/routes", (HttpContext context) =>
{
    context.Response.Headers.CacheControl = "public, max-age=3600";
    return Results.Ok(catalog);
});

app.MapGet("/api/benchmark", (string route, decimal price, string? period) =>
{
    if (!benchmarks.TryGetValue(route.Trim(), out var entry))
        return Results.NotFound(new { error = "No historical benchmark is available for this route." });
    if (price <= 0 || price > 100_000m)
        return Results.BadRequest(new { error = "Enter a positive one-way fare in USD (up to 100,000)." });

    var market = entry.Market;
    var history = market.Observations;
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
        scope = entry.Scope,
        sourceUrl = entry.Source
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
