(() => {
    'use strict';
    const key = 'flightjournal.trips.v1';
    const maxTrips = 50;
    const maxQuotes = 200;
    const maxBackupBytes = 2_000_000;
    const get = id => document.getElementById(id);
    const tripForm = get('trip-form');
    const quoteForm = get('quote-form');
    const targetForm = get('target-form');
    const select = get('saved-trip');
    const currencies = [...tripForm.elements.currency.options].map(o => o.value);
    const cabins = [...tripForm.elements.cabin.options].map(o => o.value);
    const ask = (condition, message) => { if (!condition) throw new Error(message); };
    const field = (form, name) => form.elements.namedItem(name);
    const value = (form, name) => field(form, name).value.trim();
    const uid = () => [...crypto.getRandomValues(new Uint8Array(16))]
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
    const today = () => {
        const date = new Date();
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    };
    const isoDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        && date >= '1900-01-01' && Number.isFinite(Date.parse(date))
        && new Date(date).toISOString().slice(0, 10) === date;
    const validId = id => typeof id === 'string' && /^[0-9a-f]{32}$/.test(id);
    const maxAmount = 100000;
    const scale = currency => currency === 'JPY' ? 1 : 100;
    const money = (cents, currency) => new Intl.NumberFormat(undefined, {
        style: 'currency', currency, currencyDisplay: 'code'
    }).format(cents / scale(currency));
    const fareValid = (n, currency) => Number.isInteger(n) && n > 0 && n <= maxAmount * scale(currency);
    function parseAmount(raw, currency, optional = false) {
        if (optional && raw === '') return null;
        const pattern = currency === 'JPY' ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/;
        const units = Math.round(Number(raw) * scale(currency));
        ask(pattern.test(raw) && fareValid(units, currency), 'Enter a positive fare up to 100,000 in the trip currency.');
        return units;
    }

    function cleanTrip(trip) {
        ask(trip && typeof trip === 'object' && validId(trip.id), 'Invalid trip ID.');
        const { id, origin, destination, departure, kind, returnDate, cabin, currency, target, quotes } = trip;
        ask([origin, destination].every(code => typeof code === 'string' && /^[A-Z]{3}$/.test(code)) &&
            origin !== destination, 'Enter two different three-letter airport codes.');
        ask(isoDate(departure), 'Enter a valid departure date.');
        ask((kind === 'one-way' && returnDate === null) ||
            (kind === 'round-trip' && isoDate(returnDate) && returnDate >= departure),
            'Choose a return date on or after departure.');
        ask(cabins.includes(cabin) && currencies.includes(currency), 'Choose a supported cabin and currency.');
        ask(target === null || fareValid(target, currency), 'Invalid target fare.');
        ask(Array.isArray(quotes) && quotes.length <= maxQuotes, 'Invalid quote list or too many quotes.');
        const quoteIds = new Set();
        const cleanQuotes = quotes.map(quote => {
            ask(quote && validId(quote.id) && !quoteIds.has(quote.id), 'Invalid or duplicate quote ID.');
            const { id, date, amount, note } = quote;
            ask(isoDate(date) && date <= departure, 'Quote date must be on or before departure.');
            ask(fareValid(amount, currency), 'Invalid quote fare.');
            ask(typeof note === 'string' && note.length <= 100, 'Invalid quote note.');
            quoteIds.add(id);
            return { id, date, amount, note };
        });
        return { id, origin, destination, departure, kind, returnDate, cabin, currency, target, quotes: cleanQuotes };
    }
    const identity = ({ origin, destination, departure, returnDate, cabin, currency }) =>
        [origin, destination, departure, returnDate, cabin, currency].join('|');
    function decode(text) {
        const data = JSON.parse(text);
        ask(data?.version === 1 && Array.isArray(data.trips) && data.trips.length <= maxTrips,
            'Choose a valid FlightJournal backup.');
        const trips = data.trips.map(cleanTrip);
        ask(new Set(trips.map(trip => trip.id)).size === trips.length &&
            new Set(trips.map(identity)).size === trips.length, 'The backup contains duplicate trips.');
        return trips;
    }
    const encode = trips => JSON.stringify({ version: 1, trips });
    const ordered = quotes => [...quotes].reverse().sort((a, b) => b.date.localeCompare(a.date));
    const route = t => `${t.origin} → ${t.destination}`;
    let trips = [];
    let selection = null;
    let storageBlocked = false;
    let volatile = false;
    const status = message => { get('journal-status').textContent = message; };
    function storageWarning(message) {
        const node = get('journal-storage-note');
        node.textContent = message;
        node.hidden = !message;
    }
    function load() {
        try {
            const raw = localStorage.getItem(key);
            const restored = raw ? decode(raw) : [];
            trips = restored;
            storageBlocked = false;
            storageWarning('');
        } catch {
            storageBlocked = true;
            storageWarning('Existing data could not be read. New changes are session-only; download a backup before leaving.');
        }
    }
    function save(next) {
        trips = next;
        if (!storageBlocked) {
            try {
                localStorage.setItem(key, encode(trips));
                volatile = false;
                storageWarning('');
            } catch {
                volatile = true;
                storageWarning('Could not save to this browser. Download a backup before leaving.');
            }
        }
    }
    const active = () => trips.find(t => t.id === selection);
    function update(trip, changes) {
        save(trips.map(t => t.id === trip.id ? cleanTrip({ ...t, ...changes }) : t));
        render();
    }
    function render() {
        if (!active()) selection = trips[0]?.id ?? null;
        const trip = active();
        select.replaceChildren(...trips.map(t => new Option(
            `${route(t)} · ${t.departure}${t.returnDate ? ' to ' + t.returnDate : ''} · ${t.cabin} · ${t.currency}`, t.id
        )));
        select.value = selection ?? '';
        get('trip-pick').hidden = !trip;
        get('trip-panel').hidden = !trip;
        get('trip-empty').hidden = Boolean(trip);
        get('export-journal').disabled = !trips.length;
        if (!trip) return;
        const fmt = amount => money(amount, trip.currency);
        get('trip-title').textContent = route(trip);
        get('trip-details').textContent = `${trip.departure}${trip.returnDate ? ' to ' + trip.returnDate : ''} · ${trip.kind === 'round-trip' ? 'Round trip' : 'One-way'} · ${trip.cabin} · ${trip.currency}`;
        const target = field(targetForm, 'target');
        target.value = trip.target === null ? '' : String(trip.target / scale(trip.currency));
        [target, field(quoteForm, 'amount')].forEach(input => {
            input.step = input.min = String(1 / scale(trip.currency));
        });
        const quoteDate = field(quoteForm, 'date');
        quoteDate.max = [today(), trip.departure].sort()[0];
        quoteDate.value = quoteDate.max;

        const quotes = ordered(trip.quotes);
        const latest = quotes[0];
        let summary = 'No quotes logged.';
        if (latest) {
            const lowest = Math.min(...quotes.map(q => q.amount));
            summary = `Latest: ${fmt(latest.amount)} on ${latest.date}. Lowest logged: ${fmt(lowest)} (${quotes.length} ${quotes.length === 1 ? 'quote' : 'quotes'}).`;
            if (quotes.length > 1) {
                const delta = latest.amount - quotes[1].amount;
                summary += delta ? ` ${fmt(Math.abs(delta))} ${delta > 0 ? 'higher' : 'lower'} than the previous quote.`
                    : ' Unchanged from the previous quote.';
            }
        }
        if (trip.target !== null) {
            summary += ` Target: ${fmt(trip.target)}.`;
            if (latest) summary += latest.amount <= trip.target ? ' Latest quote meets your target.' : ' Latest quote is above your target.';
        }
        get('trip-summary').textContent = summary;
        get('quote-history').hidden = !quotes.length;
        get('quote-rows').replaceChildren(...quotes.map(q => {
            const row = document.createElement('tr');
            row.insertCell().textContent = q.date;
            row.insertCell().textContent = fmt(q.amount);
            row.insertCell().textContent = q.note || '—';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'journal-button journal-delete';
            button.textContent = 'Delete';
            button.setAttribute('aria-label', `Delete quote from ${q.date}: ${fmt(q.amount)}`);
            button.addEventListener('click', () => {
                if (!window.confirm('Delete this quote?')) return;
                update(trip, { quotes: trip.quotes.filter(x => x.id !== q.id) });
                status('Quote deleted.');
            });
            row.insertCell().append(button);
            return row;
        }));
    }
    function tripFields() {
        const round = value(tripForm, 'kind') === 'round-trip';
        get('return-field').hidden = !round;
        const back = field(tripForm, 'returnDate');
        back.required = round;
        back.disabled = !round;
        back.min = value(tripForm, 'departure');
        field(tripForm, 'target').min = field(tripForm, 'target').step =
            String(1 / scale(value(tripForm, 'currency')));
    }
    function formAction(form, handler) {
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            try { handler(); } catch (error) { status(error.message); }
        });
    }

    tripForm.addEventListener('change', tripFields);
    formAction(tripForm, () => {
        ask(trips.length < maxTrips, 'You can save up to 50 trips in this browser.');
        const kind = value(tripForm, 'kind');
        const currency = value(tripForm, 'currency');
        const trip = cleanTrip({
            id: uid(), origin: value(tripForm, 'origin').toUpperCase(), destination: value(tripForm, 'destination').toUpperCase(),
            departure: value(tripForm, 'departure'), kind, returnDate: kind === 'round-trip' ? value(tripForm, 'returnDate') : null,
            cabin: value(tripForm, 'cabin'), currency, target: parseAmount(value(tripForm, 'target'), currency, true), quotes: []
        });
        ask(!trips.some(t => identity(t) === identity(trip)), 'That itinerary is already saved. Select it from your saved trips.');
        save([...trips, trip]);
        selection = trip.id;
        tripForm.reset();
        tripFields();
        get('trip-editor').open = false;
        render();
        status('Trip added.');
        select.focus();
    });
    select.addEventListener('change', () => { selection = select.value; quoteForm.reset(); render(); status(''); });
    formAction(quoteForm, () => {
        const trip = active();
        if (!trip) return;
        ask(trip.quotes.length < maxQuotes, 'This trip already has 200 quotes.');
        const date = value(quoteForm, 'date');
        ask(isoDate(date) && date <= today() && date <= trip.departure, 'Enter a quote date on or before today and departure.');
        const quote = { id: uid(), date, amount: parseAmount(value(quoteForm, 'amount'), trip.currency), note: value(quoteForm, 'note') };
        quoteForm.reset();
        update(trip, { quotes: [...trip.quotes, quote] });
        status('Quote logged.');
        field(quoteForm, 'amount').focus();
    });
    formAction(targetForm, () => {
        const trip = active();
        if (!trip) return;
        update(trip, { target: parseAmount(value(targetForm, 'target'), trip.currency, true) });
        status('Target updated.');
    });
    get('remove-trip').addEventListener('click', () => {
        const trip = active();
        if (!trip || !window.confirm(`Delete ${route(trip)} and all its quotes?`)) return;
        save(trips.filter(t => t.id !== trip.id));
        quoteForm.reset();
        render();
        status('Trip deleted.');
        if (active()) select.focus();
        else get('trip-editor').querySelector('summary').focus();
    });

    function download(filename, contents, mime) {
        const url = URL.createObjectURL(new Blob([contents], { type: mime }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const csvCell = value => {
        const string = String(value ?? '');
        // Protect spreadsheet users from notes interpreted as formulas.
        const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(string) ? "'" + string : string;
        return '"' + safe.replaceAll('"', '""') + '"';
    };
    get('quote-csv').addEventListener('click', () => {
        const t = active();
        if (!t?.quotes.length) return;
        const rows = [['Origin', 'Destination', 'Departure', 'Return', 'Cabin', 'Quote date', 'Currency', 'Fare', 'Note'],
            ...ordered(t.quotes).map(q => [t.origin, t.destination, t.departure, t.returnDate, t.cabin, q.date,
                t.currency, (q.amount / scale(t.currency)).toFixed(t.currency === 'JPY' ? 0 : 2), q.note])];
        download(`${t.origin}-${t.destination}-${t.departure}-quotes.csv`,
            rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n', 'text/csv;charset=utf-8');
    });
    get('export-journal').addEventListener('click', () => {
        download('flightjournal-backup.json', encode(trips), 'application/json');
    });
    get('import-journal').addEventListener('change', async event => {
        const input = event.target;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
            ask(file.size <= maxBackupBytes, 'That backup is too large.');
            const incoming = decode(await file.text());
            const ids = new Set(trips.map(t => t.id));
            const keys = new Set(trips.map(identity));
            const added = incoming.filter(t => !ids.has(t.id) && !keys.has(identity(t)));
            ask(trips.length + added.length <= maxTrips, 'This import would exceed the 50-trip limit. Nothing was changed.');
            if (added.length) save([...trips, ...added]);
            render();
            status(`Imported ${added.length} ${added.length === 1 ? 'trip' : 'trips'}. Skipped ${incoming.length - added.length} already saved.`);
        } catch (error) {
            status(error instanceof SyntaxError ? 'This file is not a valid FlightJournal backup.' : error.message);
        }
    });
    window.addEventListener('storage', event => {
        if ((event.key === key || event.key === null) && !storageBlocked && !volatile) {
            load();
            quoteForm.reset();
            render();
            status('Trip list refreshed from this browser.');
        }
    });

    load();
    tripFields();
    render();
})();
