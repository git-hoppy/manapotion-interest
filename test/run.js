// Local test with an in-memory blob store: node test/run.js
process.env.IP_SALT = 'salt';
process.env.ADMIN_KEY = 'secret-key';
const assert = require('assert');
const { store } = require('../lib/common');

const blobs = new Map();
store.put = async (pathname, body, options) => {
    assert.strictEqual(options.allowOverwrite, true);
    assert.strictEqual(options.addRandomSuffix, false);
    blobs.set(pathname, { body, uploadedAt: new Date() });
    return { pathname };
};
store.list = async ({ prefix }) => ({
    blobs: Array.from(blobs.entries()).filter(([p]) => p.startsWith(prefix)).map(([pathname, v]) => ({ pathname, uploadedAt: v.uploadedAt })),
    hasMore: false,
});

const interest = require('../api/interest.js');
const report = require('../api/interest-report.js');

const call = async (handler, { method = 'POST', body, query, origin = 'https://manapotion.io', ip = '1.1.1.1' } = {}) => {
    const out = { headers: {} };
    const res = {
        setHeader: (k, v) => { out.headers[k] = v; },
        status(code) { out.status = code; return res; },
        json(data) { out.body = data; return res; },
        send(data) { out.text = data; return res; },
        end() { return res; },
    };
    await handler({ method, headers: { origin, 'x-forwarded-for': ip }, body, query }, res);
    return out;
};

(async () => {
    // a vote is saved
    let r = await call(interest, { body: { set: 'Ashfall Reckoning', game: 'mtg', website: '' } });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.ok, true);
    assert.strictEqual(blobs.size, 1);
    assert.ok(/^interest\/mtg\/ashfall-reckoning\/[0-9a-f]{24}\.json$/.test(Array.from(blobs.keys())[0]));
    assert.strictEqual(r.headers['Access-Control-Allow-Origin'], 'https://manapotion.io');

    // same visitor, same set: still one vote
    await call(interest, { body: { set: 'Ashfall Reckoning', game: 'mtg' } });
    assert.strictEqual(blobs.size, 1);
    // same visitor, other set: second vote
    await call(interest, { body: { set: 'Phantom Lineage', game: 'ygo' } });
    assert.strictEqual(blobs.size, 2);
    // other visitor, first set
    await call(interest, { body: { set: 'Ashfall Reckoning', game: 'mtg' }, ip: '2.2.2.2' });
    assert.strictEqual(blobs.size, 3);

    // honeypot: answers ok, saves nothing
    r = await call(interest, { body: { set: 'Spam', game: 'mtg', website: 'http://x' }, ip: '3.3.3.3' });
    assert.strictEqual(r.status, 200); assert.strictEqual(blobs.size, 3);

    // bad input
    assert.strictEqual((await call(interest, { body: { set: '', game: 'mtg' } })).status, 400);
    assert.strictEqual((await call(interest, { body: { set: 'X', game: '' } })).status, 400);
    assert.strictEqual((await call(interest, { body: 'nope' })).status, 400);
    assert.strictEqual((await call(interest, { method: 'GET' })).status, 405);
    assert.strictEqual((await call(interest, { method: 'OPTIONS' })).status, 204);

    // foreign origin gets no CORS header
    r = await call(interest, { body: { set: 'A', game: 'mtg' }, origin: 'https://evil.example', ip: '4.4.4.4' });
    assert.strictEqual(r.headers['Access-Control-Allow-Origin'], undefined);

    // rate limit
    let last;
    for (let i = 0; i < 32; i += 1) last = await call(interest, { body: { set: `Set ${i}`, game: 'mtg' }, ip: '5.5.5.5' });
    assert.strictEqual(last.status, 429);

    // report
    assert.strictEqual((await call(report, { method: 'GET', query: {} })).status, 401);
    assert.strictEqual((await call(report, { method: 'GET', query: { key: 'wrong' } })).status, 401);
    r = await call(report, { method: 'GET', query: { key: 'secret-key', format: 'json' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.sets[0].set, 'ashfall-reckoning');
    assert.strictEqual(r.body.sets[0].people, 2);
    r = await call(report, { method: 'GET', query: { key: 'secret-key' } });
    assert.ok(r.text.includes('ashfall-reckoning'));
    console.log('all interest-service tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
