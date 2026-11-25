"""Refresh the bundled airport-pair benchmark from public USDOT Table 1a."""
import argparse
from collections import defaultdict
from decimal import Decimal
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

URL = 'https://data.transportation.gov/resource/tfrh-tu9e.json'
SOURCE = 'https://catalog.data.gov/dataset/consumer-airfare-report-table-1a-all-u-s-airport-pair-markets'
AIRPORTS = {'ATL': 'Atlanta', 'BOS': 'Boston', 'JFK': 'New York', 'LAX': 'Los Angeles',
            'MIA': 'Miami', 'ORD': 'Chicago', 'SFO': 'San Francisco'}
PAIRS = [('JFK', 'LAX'), ('JFK', 'MIA'), ('BOS', 'ORD'), ('LAX', 'SFO'), ('JFK', 'ATL')]
OUTPUT = Path(__file__).resolve().parents[1] / 'FlightApi/Data/fare-benchmarks.json'


def generate(rows):
    pair_ids = {frozenset(pair): '-'.join(pair) for pair in PAIRS}
    prices = defaultdict(dict)
    for row in rows:
        route = pair_ids[frozenset((row['airport_1'], row['airport_2']))]
        year, quarter, fare = int(row['year']), int(row['quarter']), Decimal(row['fare'])
        if not 1 <= quarter <= 4 or not fare.is_finite() or fare <= 0:
            raise ValueError(f'Bad fare observation: {row}')
        period = f'{year}-Q{quarter}'
        if period in prices[route]:
            raise ValueError(f'Duplicate observation: {route}, {period}')
        prices[route][period] = round(fare, 2)
    routes = []
    for a, b in PAIRS:
        route = f'{a}-{b}'
        if not prices[route]:
            raise ValueError(f'No observations for {route}; refusing to overwrite snapshot')
        routes.append({'id': route, 'label': f'{AIRPORTS[a]} ({a}) – {AIRPORTS[b]} ({b})',
                       'observations': [{'period': p, 'averageFare': float(v)}
                                        for p, v in sorted(prices[route].items())]})
    return {'sourceUrl': SOURCE, 'routes': routes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from-year', type=int, default=2025)
    parser.add_argument('--through-year', type=int, default=2026)
    args = parser.parse_args()
    if not 2000 <= args.from_year <= args.through_year <= 2100:
        parser.error('Provide a valid year window.')
    pairs = ' OR '.join(f"(airport_1='{a}' AND airport_2='{b}')"
                        for pair in PAIRS for a, b in (pair, pair[::-1]))
    where = f'year >= {args.from_year} AND year <= {args.through_year} AND ({pairs})'
    params = {'$where': where, '$select': 'year,quarter,airport_1,airport_2,fare',
              '$order': 'year,quarter,airport_1,airport_2', '$limit': 3000}
    with urlopen(f'{URL}?{urlencode(params)}', timeout=30) as response:
        rows = json.load(response)
    payload = generate(rows)
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
