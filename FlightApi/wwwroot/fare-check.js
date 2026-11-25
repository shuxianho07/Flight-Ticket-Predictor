const byId = id => document.getElementById(id);
const routeSelect = byId('route');
const priceInput = byId('price');
const form = byId('fareForm');
const results = byId('result-area');
const periodSelect = byId('period');
const routes = new Map();
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const demoPrices = [465, 645, 380, 400, 500, 520, 650, 650, 500, 450, 400, 600];
const day = 86_400_000;
let chart;
let pending;
const today = new Date();
byId('bookingDate').valueAsDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

function resetResult() {
    pending?.abort();
    pending = null;
    results.style.display = 'none';
    byId('error').textContent = '';
}
function selectedRoute() { return routes.get(routeSelect.value); }
function updateRoute() {
    resetResult();
    const route = selectedRoute();
    if (!route) return;
    const legacy = route.mode === 'legacy-model';
    byId('dateFields').hidden = !legacy;
    byId('bookingDate').required = legacy;
    byId('flightDate').required = legacy;
    byId('periodField').hidden = legacy;
    periodSelect.required = !legacy;
    periodSelect.replaceChildren(...route.periods.map(period => new Option(period, period)));
    byId('priceLabel').textContent = legacy ? 'Observed price ($, original demo units)' : 'Observed one-way fare (USD)';
    byId('check').textContent = legacy ? 'Run Buy/Wait Demo' : 'Compare with Historical Fare';
    byId('modeNote').textContent = legacy
        ? 'Original Toronto–Cancún demo. Its scores are experimental, not live fare forecasts.'
        : 'Compares your quote with the U.S. DOT airport-pair average for a published quarter. Both directions are pooled. Not a live quote or Buy/Wait forecast.';
    priceInput.value = '';
    byId('check').disabled = false;
}
routeSelect.addEventListener('change', updateRoute);
form.addEventListener('input', event => {
    if (event.target === routeSelect) return;
    resetResult();
    if (selectedRoute()) byId('check').disabled = false;
});

async function getJson(path, signal) {
    const response = await fetch(path, { signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error ?? 'The fare check could not be completed.');
    if (data === null) throw new Error('The fare check returned no data.');
    return data;
}

function renderLegacy(data, month) {
    byId('decision').textContent = data.decision;
    byId('comparison').textContent = `Model score: ${data.confidence}`;
    byId('resultNote').textContent = `${data.reasoning} The original demo reference for ${monthLabels[month - 1]} is $${demoPrices[month - 1]}; it is not a current market price.`;
    byId('historyArea').hidden = true;
    byId('chartContainer').hidden = typeof Chart === 'undefined';
    if (typeof Chart !== 'undefined') {
        chart?.destroy();
        chart = new Chart(byId('seasonChart'), {
            type: 'bar',
            data: { labels: monthLabels, datasets: [{
                label: 'Demo reference',
                data: demoPrices,
                backgroundColor: demoPrices.map((_, i) => i === month - 1 ? '#C08552' : '#EAE0D5')
            }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }
}

function renderBenchmark(data) {
    const direction = data.difference > 0 ? 'above' : 'below';
    byId('decision').textContent = data.difference === 0 ? 'At the historical average' : `${usd.format(Math.abs(data.difference))} ${direction} average`;
    byId('comparison').textContent = `${data.period} average: ${usd.format(data.averageFare)} USD`;
    byId('resultNote').textContent = 'Published average for this airport pair, not a prediction. Ticket taxes and mandatory fees are included; optional baggage and seat fees are not.';
    byId('chartContainer').hidden = true;
    byId('historyArea').hidden = false;
    byId('source').href = data.sourceUrl;
    const rows = data.history.map(point => {
        const row = document.createElement('tr');
        row.insertCell().textContent = point.period;
        row.insertCell().textContent = usd.format(point.averageFare);
        return row;
    });
    document.querySelector('#history tbody').replaceChildren(...rows);
}

form.addEventListener('submit', async event => {
    event.preventDefault();
    const route = selectedRoute();
    if (!route || !form.reportValidity()) return;
    resetResult();
    const controller = new AbortController();
    pending = controller;
    byId('check').disabled = true;
    try {
        const query = new URLSearchParams({ route: route.id, price: priceInput.value });
        if (route.mode === 'legacy-model') {
            const start = byId('bookingDate').valueAsNumber;
            const end = byId('flightDate').valueAsNumber;
            const days = (end - start) / day;
            if (!Number.isInteger(days) || days < 0 || days > 365) {
                throw new Error('Choose a flight date from the booking date through 365 days after it.');
            }
            const month = new Date(end).getUTCMonth() + 1;
            query.set('days', days);
            query.set('month', month);
            const data = await getJson(`/predict?${query}`, controller.signal);
            if (pending !== controller) return;
            results.style.display = 'block';
            renderLegacy(data, month);
        } else {
            query.set('period', periodSelect.value);
            const data = await getJson(`/api/benchmark?${query}`, controller.signal);
            if (pending !== controller) return;
            results.style.display = 'block';
            renderBenchmark(data);
        }
    } catch (error) {
        if (pending === controller) {
            results.style.display = 'none';
            byId('error').textContent = error.message;
        }
    } finally {
        if (pending === controller) {
            pending = null;
            byId('check').disabled = false;
        }
    }
});

getJson('/api/routes').then(items => {
    items.forEach(route => routes.set(route.id, route));
    const options = items.map(route => new Option(route.label, route.id));
    routeSelect.replaceChildren(...options);
    routeSelect.disabled = false;
    updateRoute();
}).catch(() => { byId('error').textContent = 'Could not load routes. Refresh the page to retry.'; });
