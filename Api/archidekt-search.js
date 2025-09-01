// Serverless function (Vercel/Netlify compatible) to search decks on Archidekt

const ARCHIDEKT_BASE = 'https://archidekt.com/api';

// Archidekt format IDs (community-known)
export const ARCHIDEKT_FORMATS = {
  Standard: 1,
  Modern: 2,
  'Commander / EDH': 3,
  'Commander/EDH': 3, // UI aliases
  Commander: 3,
  Legacy: 4,
  Vintage: 5,
  Pauper: 6,
  Custom: 7,
  Frontier: 8,
  'Future Standard': 9,
  'Penny Dreadful': 10,
  '1v1 Commander': 11,
  'Dual Commander': 12,
  Brawl: 13
};

const COLOR_NAMES = ['White', 'Blue', 'Black', 'Red', 'Green', 'Colorless'];

function toQuery(params) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v == null || v === '') return;
    if (Array.isArray(v)) {
      if (v.length) usp.append(k, v.join(','));
    } else {
      usp.append(k, String(v));
    }
  });
  return usp.toString();
}

function normalizeInput(body) {
  const {
    name = '',
    colors = [],
    formats = [],
    commanders = [],
    pageSize = 20,
    orderBy = '-createdAt',
    includeSiteTotal = false
  } = body || {};

  const fmtIds = (Array.isArray(formats) ? formats : [])
    .map((f) => ARCHIDEKT_FORMATS[f])
    .filter(Boolean);
  const safeColors = (Array.isArray(colors) ? colors : []).filter((c) => COLOR_NAMES.includes(c));
  const safeCommanders = (Array.isArray(commanders) ? commanders : []).map((c) => c.trim()).filter(Boolean);

  return { name, colors: safeColors, formats: fmtIds, commanders: safeCommanders, pageSize, orderBy, includeSiteTotal };
}

async function searchArchidektDecks(params) {
  const qs = toQuery({
    name: params.name || '',
    colors: params.colors,                       // comma list of color names
    formats: params.formats.join(','),          // comma list of IDs
    commanders: params.commanders.length ? `\"${params.commanders.join('\",\"')}\"` : undefined,
    pageSize: Math.max(1, Math.min(100, Number(params.pageSize) || 20)),
    orderBy: params.orderBy || '-createdAt'
  });

  const url = `${ARCHIDEKT_BASE}/decks/cards/?${qs}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Archidekt search failed (${res.status}): ${text.slice(0,200)}`);
  }
  const json = await res.json();

  // Many Archidekt endpoints return { count, next, previous, results }
  const totalMatching = Number(json?.count ?? json?.total ?? 0);

  const results = json?.results || json?.decks || json || [];
  const decks = results.map((d) => ({
    id: d.id ?? d?.deck?.id,
    name: d.name ?? d?.deck?.name,
    owner: d.owner ?? d?.deck?.owner,
    formatId: d.format ?? d?.deck?.format,
    url: `https://archidekt.com/decks/${d.id ?? d?.deck?.id}`,
    createdAt: d.createdAt ?? d?.deck?.createdAt,
    updatedAt: d.updatedAt ?? d?.deck?.updatedAt
  }));

  return { url, decks, totalMatching };
}

// --- Site total cache (avoid re-hitting for every search) ---
let SITE_TOTAL_CACHE = { value: null, ts: 0 };
const SITE_TOTAL_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchArchidektSiteTotal() {
  // Minimal query: 1 item per page, no filters — use 'count' as site total of public decks
  const url = `${ARCHIDEKT_BASE}/decks/cards/?pageSize=1`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Archidekt total failed (${r.status})`);
  const j = await r.json();
  return Number(j?.count ?? j?.total ?? 0) || null;
}

async function getSiteTotal() {
  const now = Date.now();
  if (SITE_TOTAL_CACHE.value && (now - SITE_TOTAL_CACHE.ts) < SITE_TOTAL_TTL_MS) {
    return SITE_TOTAL_CACHE.value;
  }
  try {
    const total = await fetchArchidektSiteTotal();
    SITE_TOTAL_CACHE = { value: total, ts: now };
    return total;
  } catch {
    return SITE_TOTAL_CACHE.value; // return stale if present, else null
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST with JSON body.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const params = normalizeInput(body);

    const { url, decks, totalMatching } = await searchArchidektDecks(params);
    const siteTotal = params.includeSiteTotal ? await getSiteTotal() : null;

    res.setHeader('Cache-Control', 's-maxage=180, stale-while-revalidate=600');
    return res.status(200).json({
      ok: true,
      source: 'archidekt',
      requestUrl: url,
      count: decks.length,          // number returned in this page
      total_matching: totalMatching, // total matching the filters
      site_total: siteTotal,         // total public decks on site (approx.)
      decks
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}

export const core = { ARCHIDEKT_FORMATS, searchArchidektDecks };
