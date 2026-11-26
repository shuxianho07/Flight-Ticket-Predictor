"""Build a reproducible bundled benchmark from public USDOT Tables 1a and 6."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import gzip
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

DATA = Path(__file__).resolve().parents[1] / 'FlightApi/Data'
TABLES = {'airport': ('tfrh-tu9e', 'tbl1apk'), 'city': ('yj5y-b2ir', 'tbl6pk')}
PAGE_SIZE = 2000
COMPAT_IDS = {'ATL-JFK': 'JFK-ATL', 'LAX-SFO': 'LAX-SFO'}
MIN_MARKETS = {'airport': 1000, 'city': 5000}


def request(table, params):
    with urlopen(f'https://data.transportation.gov/resource/{table}.json?{urlencode(params)}', timeout=60) as response:
        return json.load(response)


def collect(mode, start, end):
    table, key = TABLES[mode]
    fields = ['year', 'quarter', 'city1', 'city2', 'fare', key]
    endpoints = ('airport_1', 'airport_2') if mode == 'airport' else ('citymarketid_1', 'citymarketid_2')
    fields += list(endpoints)
    where = f'year between {start} and {end}'
    markets = {}
    seen_keys = set()
    offset = 0
    while True:
        rows = request(table, {'$where': where, '$select': ','.join(fields), '$order': key,
                               '$limit': PAGE_SIZE, '$offset': offset})
        for row in rows:
            if row[key] in seen_keys:
                raise ValueError(f'{mode}: duplicate source key {row[key]}')
            seen_keys.add(row[key])
            a, b = sorted(((row[endpoints[0]], row['city1']), (row[endpoints[1]], row['city2'])))
            route_id = f'{a[0]}-{b[0]}'
            if mode == 'city':
                route_id = 'city-' + route_id
            else:
                route_id = COMPAT_IDS.get(route_id, route_id)
            q, y, fare = int(row['quarter']), int(row['year']), Decimal(row['fare'])
            if not (1 <= q <= 4 and start <= y <= end and fare.is_finite() and 0 < fare <= 100_000):
                raise ValueError(f'{mode}: invalid observation {row[key]}')
            period = f'{y}-Q{q}'
            label = f'{a[1]} ({a[0]}) – {b[1]} ({b[0]})' if mode == 'airport' else f'{a[1]} – {b[1]}'
            entry = markets.setdefault(route_id, {'labels': {}, 'observations': {}})
            if period in entry['observations']:
                raise ValueError(f'{mode}: duplicate observation for {route_id}, {period}')
            entry['observations'][period] = float(round(fare, 2))
            entry['labels'][period] = label
        if len(rows) < PAGE_SIZE:
            break
        offset += len(rows)
    if len(markets) < MIN_MARKETS[mode]:
        raise ValueError(f'{mode}: unusually few markets ({len(markets)}); snapshot not replaced')
    return [
        {'id': route_id, 'label': entry['labels'][max(entry['labels'])],
         'observations': [{'period': period, 'averageFare': fare}
                          for period, fare in sorted(entry['observations'].items())]}
        for route_id, entry in sorted(markets.items())
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--from-year', type=int, default=2025)
    parser.add_argument('--through-year', type=int, default=2026)
    args = parser.parse_args()
    if not 2000 <= args.from_year <= args.through_year <= 2100:
        parser.error('Provide a valid year window.')
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {mode: pool.submit(collect, mode, args.from_year, args.through_year) for mode in TABLES}
        result = {mode: job.result() for mode, job in jobs.items()}
    for mode, markets in result.items():
        payload = json.dumps(markets, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        target = DATA / f'{mode}-fares.json.gz'
        temp = target.with_suffix('.tmp')
        temp.write_bytes(gzip.compress(payload, mtime=0))
        temp.replace(target)
        print(f'{mode}: {len(markets):,} markets, {sum(len(r["observations"]) for r in markets):,} observations')


if __name__ == '__main__':
    main()
