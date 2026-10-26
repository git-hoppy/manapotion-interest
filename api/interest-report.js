// =============================================================================
// Mana Potion - interest report (for Dario only)
//
// GET /api/interest-report?key=<ADMIN_KEY>            -> a small table: game, set, number of people
// GET /api/interest-report?key=<ADMIN_KEY>&format=json -> the same as JSON
// Environment variable: ADMIN_KEY (any long random text). Without it the report is switched off.
// =============================================================================

'use strict';

const crypto = require('crypto');
const { env, store, setCors } = require('../lib/common');

const safeEqual = (a, b) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const escapeHtml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const collect = async () => {
    const counts = new Map();
    let cursor;
    do {
        // eslint-disable-next-line no-await-in-loop
        const page = await store.list({ prefix: 'interest/', limit: 1000, cursor });
        page.blobs.forEach((blob) => {
            const m = /^interest\/([^/]+)\/([^/]+)\/[^/]+\.json$/.exec(blob.pathname);
            if (!m) return;
            const key = `${m[1]}/${m[2]}`;
            const row = counts.get(key) || { game: m[1], set: m[2], people: 0, last: '' };
            row.people += 1;
            const when = blob.uploadedAt ? new Date(blob.uploadedAt).toISOString() : '';
            if (when > row.last) row.last = when;
            counts.set(key, row);
        });
        cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return Array.from(counts.values()).sort((a, b) => b.people - a.people || a.set.localeCompare(b.set));
};

module.exports = async (req, res) => {
    setCors(req, res, 'GET, OPTIONS');
    const adminKey = env('ADMIN_KEY', '');
    const given = (req.query && req.query.key) || '';
    if (!adminKey || !given || !safeEqual(given, adminKey)) {
        res.status(401).json({ ok: false, error: 'unauthorized' });
        return;
    }
    try {
        const rows = await collect();
        if (req.query && req.query.format === 'json') {
            res.status(200).json({ ok: true, sets: rows });
            return;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        const body = rows.length
            ? rows.map((r) => `<tr><td>${escapeHtml(r.game)}</td><td>${escapeHtml(r.set)}</td><td style="text-align:right">${r.people}</td><td>${escapeHtml(r.last.slice(0, 16).replace('T', ' '))}</td></tr>`).join('')
            : '<tr><td colspan="4">No votes yet.</td></tr>';
        res.status(200).send(`<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Interest report</title>
<style>body{font:15px system-ui,sans-serif;margin:24px;color:#222}table{border-collapse:collapse}td,th{padding:6px 14px;border-bottom:1px solid #ddd;text-align:left}</style>
<h1>Interest report</h1><table><tr><th>Game</th><th>Set</th><th>People</th><th>Last vote (UTC)</th></tr>${body}</table>`);
    } catch (error) {
        console.error('interest report failed', error && error.message); // eslint-disable-line no-console
        res.status(500).json({ ok: false, error: 'server' });
    }
};
