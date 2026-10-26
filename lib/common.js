'use strict';

// Shared helpers for the interest service.
const crypto = require('crypto');

const env = (name, fallback) => (process.env[name] !== undefined && process.env[name] !== '' ? process.env[name] : fallback);

// The blob store. Replaced in test/run.js by an in-memory fake.
const store = {
    put: (...args) => require('@vercel/blob').put(...args),
    list: (...args) => require('@vercel/blob').list(...args),
};

const clean = (value, max) => String(value === undefined || value === null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);

const slugify = (value) => clean(value, 120)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const allowedOrigins = () => env('ALLOWED_ORIGINS', 'https://manapotion.io,https://www.manapotion.io')
    .split(',').map((s) => s.trim()).filter(Boolean);

const setCors = (req, res, methods) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins().includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Cache-Control', 'no-store');
};

const clientIp = (req) => String((req.headers['x-forwarded-for'] || '')).split(',')[0].trim() || 'unknown';

// One vote per visitor and set: the blob name is a hash of the IP address (with a secret salt), so the raw
// address is never stored and a second click from the same address just overwrites the same file.
const voterHash = (ip, setSlug) => crypto
    .createHash('sha256')
    .update(`${env('IP_SALT', 'mana-potion')}|${ip}|${setSlug}`)
    .digest('hex')
    .slice(0, 24);

module.exports = { env, store, clean, slugify, setCors, clientIp, voterHash };
