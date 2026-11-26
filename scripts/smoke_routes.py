"""Smoke-test an already running FlightJournal instance."""
import argparse
import json
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base_url', nargs='?', default='http://127.0.0.1:5005')
    base = parser.parse_args().base_url.rstrip('/')

    def fetch(path, status=200, **params):
        url = base + path + ('?' + urlencode(params) if params else '')
        try:
            response = urlopen(url, timeout=10)
        except HTTPError as error:
            response = error
        with response:
            assert response.status == status, (url, response.status, response.read())
            return response.read()

    assert b'id="fareForm"' in fetch('/')
    assert b'/api/benchmark' in fetch('/fare-check.js')
    routes = json.loads(fetch('/api/routes'))
    by_id = {route['id']: route for route in routes}
    assert len(by_id) == len(routes)
    assert len([r for r in routes if r['scope'] == 'airport']) >= 1000
    assert len([r for r in routes if r['scope'] == 'city']) >= 5000
    assert [r['id'] for r in routes if r['mode'] == 'legacy-model'] == ['YYZ-CUN']
    seattle_boston = next(r for r in routes if r['scope'] == 'city' and
                          'Seattle' in r['label'] and 'Boston' in r['label'])
    for key in ('JFK-LAX', 'JFK-MIA', 'BOS-ORD', 'LAX-SFO', 'JFK-ATL', seattle_boston['id']):
        route = by_id[key]
        comparison = json.loads(fetch('/api/benchmark', route=key, price=450))
        assert comparison['route'] == key and comparison['currency'] == 'USD'
        assert comparison['scope'] == route['scope']
        assert comparison['period'] == max(route['periods'])
        assert [point['period'] for point in comparison['history']] == sorted(route['periods'])
        assert all(point['averageFare'] > 0 for point in comparison['history'])
    compare = json.loads(fetch('/api/benchmark', route='JFK-LAX', price=450, period='2026-Q1'))
    assert compare['averageFare'] == 508.31 and compare['difference'] == -58.31
    assert compare['percentageDifference'] == -11.5
    fetch('/api/benchmark', 404, route='YYZ-YVR', price=450)
    fetch('/api/benchmark', 404, route='JFK-LAX', price=450, period='2030-Q1')
    fetch('/api/benchmark', 400, route='JFK-LAX', price=-10)
    fetch('/predict', 400, route='JFK-LAX', days=78, month=4, price=350)
    fetch('/predict', 400, destType=1, days=78, month=4, price=350)
    legacy = json.loads(fetch('/predict', route='YYZ-CUN', days=78, month=4, price=350))
    assert legacy['decision'] in {'BUY NOW', 'WAIT'} and legacy['route'] == 'YYZ-CUN'
    assert 0 <= float(legacy['confidence'].rstrip('%')) <= 100
    print(f'PASS: {len(routes) - 1:,} historical markets, airport and city fare comparisons, legacy ONNX, and unsupported-route guards.')


if __name__ == '__main__':
    main()
