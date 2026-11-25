# FlightJournal

Check an airfare by airport pair. The app has two clearly separate modes:

| Route | What you get |
| --- | --- |
| Toronto Pearson (YYZ) to Cancún (CUN) | The original experimental Buy/Wait demo, using the existing ONNX model. |
| New York (JFK)–Los Angeles (LAX), New York (JFK)–Miami (MIA), Boston (BOS)–Chicago (ORD), Los Angeles (LAX)–San Francisco (SFO), and New York (JFK)–Atlanta (ATL) | Compare your observed one-way USD fare with a published quarterly airport-pair average. These routes do not generate a Buy/Wait forecast. |

## Run

With the .NET 8 SDK installed:

```sh
dotnet run --project FlightApi --no-launch-profile --urls http://127.0.0.1:5005
```

Open http://127.0.0.1:5005. The snapshot and existing model are included; no provider key or training step is required. The optional legacy chart uses Chart.js, but both fare checks work without it.

- `GET /api/routes` returns supported route IDs, their modes and observed quarters.
- `GET /api/benchmark?route=JFK-LAX&price=450&period=2026-Q1` compares $450 with the $508.31 published average. Omit `period` to use the route's latest published quarter.
- `GET /predict?route=YYZ-CUN&days=78&month=4&price=350` runs the original demo. Requests for other routes are rejected instead of reusing the Cancún model.

## Data and limitations

The bundled benchmark is a small snapshot of public [U.S. Department of Transportation Consumer Airfare Report, Table 1a](https://catalog.data.gov/dataset/consumer-airfare-report-table-1a-all-u-s-airport-pair-markets). The included observations run from 2025 Q1 through 2026 Q1. Fares are rounded to cents. Each airport-pair average pools both travel directions, includes ticket taxes and mandatory fees, and excludes optional fees. Round-trip ticket fares are prorated by the source. The benchmark cannot tell whether an individual fare will rise or fall, or retrieve live quotes.

To refresh the selected markets with Python 3:

```sh
python scripts/update_dot_fares.py --from-year 2025 --through-year 2026
```

The original YYZ–CUN ONNX model uses airfare references, synthetic scenarios, and manually labeled examples. Its score is not a calibrated probability of finding a cheaper fare, and the old monthly chart is illustrative. The existing model files and training scripts are unchanged. Route-specific Buy/Wait forecasts would require time-stamped comparable fare quotes observed repeatedly before departure, rights to use that data, and chronological out-of-sample validation.

## Verify the running app

With the server running, run `python scripts/smoke_routes.py`. It verifies route discovery, the bundled fare comparisons, invalid-route handling, and the Toronto–Cancún ONNX response through the HTTP endpoints.
