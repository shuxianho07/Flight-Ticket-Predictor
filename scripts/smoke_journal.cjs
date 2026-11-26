// Run against the served app with jsdom 26 and Node 22+.
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const base = process.argv[2] || 'http://127.0.0.1:5005';
const key = 'flightjournal.trips.v1';

async function run() {
    const [markup, script] = await Promise.all(['/', '/journal.js'].map(async path => {
        const res = await fetch(new URL(path, base));
        assert(res.ok, `${path} was not served`);
        return res.text();
    }));

    const sessions = [];
    function open(saved) {
        const dom = new JSDOM(markup, { runScripts: 'outside-only', url: base });
        const w = dom.window;
        const downloads = [];
        sessions.push(w);
        if (saved !== undefined) w.localStorage.setItem(key, saved);
        w.confirm = () => true;
        w.Blob = global.Blob;
        let pendingBlob;
        w.URL.createObjectURL = blob => { pendingBlob = blob; return 'blob:smoke'; };
        w.URL.revokeObjectURL = () => {};
        w.HTMLAnchorElement.prototype.click = function () {
            downloads.push({ filename: this.download, blob: pendingBlob });
        };
        w.fetch = () => { throw Error('Journal must not use the network'); };
        w.eval(script);
        const get = id => w.document.getElementById(id);
        function set(form, values) {
            const f = get(form);
            Object.entries(values).forEach(([name, value]) => {
                const field = f.elements.namedItem(name);
                field.value = value;
                field.dispatchEvent(new w.Event('change', { bubbles: true }));
            });
            return f;
        }
        function submit(form, values) {
            const f = set(form, values);
            f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
        }
        async function loadBackup(text) {
            const f = get('import-journal');
            Object.defineProperty(f, 'files', {
                configurable: true, value: [{ size: Buffer.byteLength(text), text: async () => text }]
            });
            f.dispatchEvent(new w.Event('change', { bubbles: true }));
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        return {
            w, get, submit, loadBackup, downloads, saved: () => w.localStorage.getItem(key),
            text: id => get(id).textContent
        };
    }

    const day = new Date('2025-10-01').toISOString().slice(0, 10);
    const later = '2025-10-05';
    const first = {
        origin: 'yyz', destination: 'yvr', departure: '2030-04-01',
        kind: 'round-trip', returnDate: '2030-04-08', currency: 'CAD', target: '450'
    };
    try {
        const app = open();
        assert.match(app.text('trip-empty'), /No trips/);
        app.submit('trip-form', { ...first, destination: 'YYZ' });
        assert.match(app.text('journal-status'), /different/);
        app.submit('trip-form', first);
        assert.match(app.text('trip-title'), /YYZ → YVR/);
        assert.match(app.text('trip-details'), /2030-04-08/);
        assert.match(app.text('trip-summary'), /450\.00/);
        app.submit('quote-form', { date: later, amount: '420', note: 'Airline, "bag included"' });
        app.submit('quote-form', { date: day, amount: '550', note: 'Early quote' });
        assert.match(app.text('trip-summary'), /Latest:.*420\.00.*Lowest logged:.*420\.00/);
        assert.match(app.text('trip-summary'), /130\.00 lower.*meets your target/);
        app.submit('target-form', { target: '399' });
        assert.match(app.text('trip-summary'), /above your target/);
        app.get('quote-csv').click();
        assert.match(await app.downloads[0].blob.text(), /"CAD","420\.00","Airline, ""bag included"""/);
        app.submit('trip-form', { origin: 'YYZ', destination: 'Tokyo', departure: '2030-05-01' });
        assert.equal(app.get('saved-trip').options.length, 1, 'Only three-letter codes accepted');
        app.submit('trip-form', {
            origin: 'YYZ', destination: 'HND', departure: '2030-05-01',
            kind: 'one-way', cabin: 'Business', currency: 'JPY', target: '75000'
        });
        assert.match(app.text('trip-summary'), /No quotes/);
        app.submit('quote-form', { date: later, amount: '70000', note: 'Airline' });
        assert.match(app.text('trip-summary'), /JPY.*70,000/);
        assert.match(app.text('trip-summary'), /meets your target/);
        app.get('export-journal').click();
        const backup = await app.downloads[1].blob.text();
        const restored = open(app.saved());
        assert.equal(restored.get('saved-trip').options.length, 2);
        assert.match(restored.text('trip-summary'), /2 quotes/);
        restored.get('quote-rows').querySelector('button').click();
        assert.match(restored.text('trip-summary'), /1 quote/);
        restored.get('remove-trip').click();
        assert.equal(restored.get('saved-trip').options.length, 1);

        const migrated = open();
        await migrated.loadBackup(backup);
        assert.equal(migrated.get('saved-trip').options.length, 2);
        assert.match(migrated.text('journal-status'), /Imported 2 trips/);
        await migrated.loadBackup(backup);
        assert.match(migrated.text('journal-status'), /Skipped 2/);
        await migrated.loadBackup('{bad json');
        assert.match(migrated.text('journal-status'), /not a valid FlightJournal backup/);
        assert.equal(migrated.get('saved-trip').options.length, 2);
        const damaged = open('{unreadable-data');
        assert.match(damaged.text('journal-storage-note'), /session-only/);
        damaged.submit('trip-form', first);
        assert.equal(damaged.saved(), '{unreadable-data', 'Do not overwrite unreadable browser data');
        console.log('PASS: trip/quote entries, currency isolation, target changes, CSV, persistence, deletions, portable backup and input validation.');
    } finally {
        sessions.forEach(w => w.close());
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
