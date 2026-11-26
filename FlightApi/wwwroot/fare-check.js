const byId = id => document.getElementById(id);
const routeSelect = byId('route');
const routeFilter = byId('routeFilter');
const priceInput = byId('price');
const form = byId('fareForm');
const results = byId('result-area');
const periodSelect = byId('period');
const routes = new Map();
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const demoPrices = [465, 645, 380, 400, 500, 520, 650, 650, 500, 450, 400, 600];
const day = 86_400_000;
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
    if (!route) {
        byId('check').disabled = true;
        byId('dateFields').hidden = true;
        byId('bookingDate').required = false;
        byId('flightDate').required = false;
        byId('periodField').hidden = true;
        periodSelect.required = false;
        byId('modeNote').textContent = 'Choose a route to continue.';
        return;
    }
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
        : `Published U.S. DOT ${route.scope === 'city' ? 'metro-area' : 'specific-airport'} average. Both directions are pooled. Not a live quote or Buy/Wait forecast.`;
    priceInput.value = '';
    byId('check').disabled = false;
}
routeSelect.addEventListener('change', updateRoute);
form.addEventListener('input', event => {
    if (event.target === routeSelect || event.target === routeFilter) return;
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
    byId('chartContainer').hidden = false;
    const max = Math.max(...demoPrices);
    const bars = monthLabels.map((label, index) => {
        const item = document.createElement('li');
        item.title = `${label}: $${demoPrices[index]}`;
        item.setAttribute('aria-label', item.title);
        if (index === month - 1) item.setAttribute('aria-current', 'true');
        const bar = document.createElement('span');
        bar.className = 'bar';
        bar.style.height = `${100 * demoPrices[index] / max}%`;
        const monthName = document.createElement('span');
        monthName.textContent = label;
        item.append(bar, monthName);
        return item;
    });
    byId('seasonChart').replaceChildren(...bars);
}

function renderBenchmark(data) {
    const direction = data.difference > 0 ? 'above' : 'below';
    byId('decision').textContent = data.difference === 0 ? 'At the historical average' : `${usd.format(Math.abs(data.difference))} ${direction} average`;
    byId('comparison').textContent = `${data.period} average: ${usd.format(data.averageFare)} USD`;
    byId('resultNote').textContent = `Published ${data.scope === 'city' ? 'metro-area' : 'airport-pair'} average, not a prediction. Ticket taxes and mandatory fees are included; optional baggage and seat fees are not.`;
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

const popular = ['YYZ-CUN', 'JFK-LAX', 'JFK-MIA', 'BOS-ORD', 'LAX-SFO', 'JFK-ATL'];
const searchKey = text => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
const maxResults = 100;
let searchable = [];
function filterRoutes() {
    const tokens = searchKey(routeFilter.value).split(/\s+/).filter(Boolean);
    const previous = routeSelect.value;
    const found = tokens.length
        ? searchable.filter(({ key }) => tokens.every(token => key.includes(token))).map(x => x.route)
        : popular.map(id => routes.get(id)).filter(Boolean);
    const visible = found.slice(0, maxResults);
    const options = visible.map(r => new Option(
        `${r.label} [${r.scope === 'city' ? 'metro areas' : r.scope === 'demo' ? 'demo' : 'airports'}]`, r.id
    ));
    if (tokens.length) options.unshift(new Option(visible.length ? 'Choose a matching route' : 'No matching routes', ''));
    routeSelect.replaceChildren(...options);
    routeSelect.value = visible.some(r => r.id === previous)
        ? previous : !tokens.length || visible.length === 1 ? visible[0]?.id ?? '' : '';
    routeSelect.disabled = !visible.length;
    byId('routeCount').textContent = !tokens.length
        ? `Search ${(routes.size - 1).toLocaleString()} published U.S. routes. A few examples are listed below.`
        : found.length > maxResults
            ? `Showing the first ${maxResults} of ${found.length} matches. Add another city or code to narrow the results.`
            : found.length ? `${found.length} matching ${found.length === 1 ? 'route' : 'routes'}.`
            : 'No published match. Try another spelling, or compare your own quotes below.';
    if (routeSelect.value !== previous || !previous) updateRoute();
}

routeFilter.addEventListener('input', filterRoutes);
routeFilter.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
getJson('/api/routes').then(items => {
    items.forEach(route => routes.set(route.id, route));
    searchable = items.map(route => ({ route, key: searchKey(route.label + ' ' + route.id) }));
    routeFilter.disabled = false;
    filterRoutes();
}).catch(() => { byId('error').textContent = 'Could not load routes. Refresh the page to retry.'; });

const personalForm = byId('personalForm');
const personalResult = byId('personalResult');
const amount = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
personalForm.addEventListener('input', () => { personalResult.textContent = ''; });
personalForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!personalForm.reportValidity()) return;
    const raw = byId('pastQuotes').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const values = raw.map(value => /^\d+(?:\.\d{1,2})?$/.test(value) ? Number(value) : NaN);
    if (values.length < 3 || values.length > 100 || values.some(value => !Number.isFinite(value) || value <= 0 || value > 100000)) {
        personalResult.textContent = 'Enter 3 to 100 previous amounts, one per line, without symbols or separators (e.g. 420.50).';
        return;
    }
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    const diff = Math.round((byId('personalPrice').valueAsNumber - median) * 100) / 100;
    const comparison = diff ? `${amount.format(Math.abs(diff))} ${diff > 0 ? 'above' : 'below'} the median` : 'At the median';
    personalResult.textContent = `${comparison} of ${amount.format(median)} from ${values.length} previous quotes in your currency.`;
});
