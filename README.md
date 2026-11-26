# FlightJournal

Search by city name or airport code to compare a fare with actual published
U.S. averages. Use two names or codes (e.g. **Boston Seattle** or **JFK LAX**)
to narrow your results. Results distinguish specific airport pairs from metro
areas, which can include multiple airports.

| Mode | What it does |
| --- | --- |
| Published U.S. benchmark | Compares your observed one-way USD fare with a quarterly average and shows its history. |
| Toronto Pearson (YYZ) → Cancún (CUN) demo | Runs the original experimental Buy/Wait ONNX model for that route only. |
| My own quotes | Compares your current quote with the median of 3–100 previous comparable quotes for any route, including Canadian and international routes. Nothing is sent or stored. |

None of the modes fetches live quotes. The historical comparisons do not
predict Buy/Wait. The Toronto–Cancún model uses historical reference prices,
synthetic scenarios and manually labeled examples; its score is not a
calibrated probability, and the reference chart is illustrative.

## Run

With the .NET 8 SDK installed:

```sh
dotnet run --project FlightApi --no-launch-profile --urls http://127.0.0.1:5005
```

Open http://127.0.0.1:5005. The model and the historical snapshots are bundled.
No data provider token or model training is required.

- `GET /api/routes` returns IDs, route scope, modes and available quarters.
- `GET /api/benchmark?route=JFK-LAX&price=450&period=2026-Q1` compares
  $450 with the $508.31 published average. If `period` is omitted, it uses
  the latest available quarter for that route.
- `GET /predict?route=YYZ-CUN&days=78&month=4&price=350` runs the demo.
  Requests with any other route are rejected.

## Data

The bundled 2025–2026 snapshots use public [U.S. DOT Table 1a
(airport pairs)](https://catalog.data.gov/dataset/consumer-airfare-report-table-1a-all-u-s-airport-pair-markets)
and [Table 6 (contiguous U.S. city pairs)](https://data.transportation.gov/d/yj5y-b2ir).
These are published markets, not every route. Each historical fare pools
both directions, includes ticket taxes and mandatory fees, and excludes
optional fees. The source prorates round-trip ticket fares. Metro averages
do not necessarily represent any particular airport. Available quarters
vary by route and the Department's publication schedule.

The bundled benchmarks do not cover Toronto or international markets. Compare
your own quotes for those routes, using the same itinerary conditions and
currency. Route-specific predictions would require time-stamped comparable
quotes repeatedly observed before departure and chronological out-of-sample
validation; this project does not claim those predictions.

Refresh both snapshots with Python 3:

```sh
python scripts/update_dot_fares.py --from-year 2025 --through-year 2026
```

With the app running, verify the served UI assets, both scopes of historical
comparisons, and legacy ONNX inference with `python scripts/smoke_routes.py`.

## Trip tracker

Create a trip for any two airport codes, choose exact travel dates, cabin and
currency, then log the total fare per traveler as you shop. The tracker shows
the latest quote, your lowest logged quote, change from the previous quote,
and whether your latest fare meets an optional target. It never mixes
different itinerary dates, cabins or currencies, and it never sends a quote
to a server. Use the same baggage terms for each quote.

Trips are saved in the current browser for this site. They do not sync and
can be lost if you clear site data or use private browsing. Use **Back up or
transfer trips** to export/import JSON, or **Export trip CSV** for a spreadsheet.
Import does not replace already-saved itineraries. A target is checked when
you log or view your own quotes; it does not send notifications or watch fares.

To smoke-test the served tracker, install `jsdom@26` in a temporary Node
environment, expose it through `NODE_PATH`, then run
`node scripts/smoke_journal.cjs [base-url]` (Node 22+).
