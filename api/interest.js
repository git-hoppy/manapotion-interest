// =============================================================================
// Mana Potion - "I'm interested" counter for the release calendar (Vercel serverless function)
//
// POST /api/interest   (JSON)  { set: "Ashfall Reckoning", game: "mtg", website: "" }
//   -> saves one anonymous vote for that set (one per visitor and set) and answers { ok: true }
//
// Votes are tiny files in Vercel Blob: interest/<game>/<set-slug>/<hash>.json
// Environment variables: BLOB_READ_WRITE_TOKEN (set automatically when a Blob store is connected),
//   IP_SALT (any long random text), ALLOWED_ORIGINS (optional).
// Read the counts with /api/interest-report?key=<ADMIN_KEY>.
// =============================================================================

'use strict';

const { store, clean, slugify, setCors, clientIp, voterHash } = require('../lib/common');

const RATE_LIMIT = 30;                       // requests per IP per hour (best effort, per server instance)
const RATE_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map();

const rateLimited = (ip) => {
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) hits.clear();
    return recent.length > RATE_LIMIT;
};

const readBody = (req) => {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
        try { return JSON.parse(req.body); } catch (e) { return null; }
    }
    return null;
};

module.exports = async (req, res) => {
    setCors(req, res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method' }); return; }

    const body = readBody(req);
    if (!body) { res.status(400).json({ ok: false, error: 'invalid' }); return; }

    // honeypot: a bot filled the hidden field; look like it worked, save nothing
    if (clean(body.website, 50) !== '') { res.status(200).json({ ok: true }); return; }

    const ip = clientIp(req);
    if (rateLimited(ip)) { res.status(429).json({ ok: false, error: 'busy' }); return; }

    const name = clean(body.set, 120);
    const game = slugify(clean(body.game, 40));
    const setSlug = slugify(name);
    if (!name || !game || !setSlug) { res.status(400).json({ ok: false, error: 'invalid' }); return; }

    try {
        await store.put(
            `interest/${game}/${setSlug}/${voterHash(ip, setSlug)}.json`,
            JSON.stringify({ set: name, game, at: new Date().toISOString() }),
            { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' },
        );
        res.status(200).json({ ok: true });
    } catch (error) {
        console.error('interest save failed', error && error.message); // eslint-disable-line no-console
        res.status(500).json({ ok: false, error: 'server' });
    }
};
