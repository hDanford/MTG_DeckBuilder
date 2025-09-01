// Serverless function to query Scryfall's public API for cards
// Docs: https://scryfall.com/docs/api  | Search syntax: https://scryfall.com/docs/syntax
// Notes: Respect Scryfall's rate guidance (~10 req/s) and add small delays if batching.

const BASE = 'https://api.scryfall.com/cards/search';
const FORMAT_MAP = {
  Standard: 'standard',
  Modern: 'modern',
  Pioneer: 'pioneer',
  Legacy: 'legacy',
  Vintage: 'vintage',
  Pauper: 'pauper',
  Brawl: 'brawl',
  Commander: 'commander',
  'Commander/EDH': 'commander',
  'Commander / EDH': 'commander'
};
const COLOR_LETTERS = { White: 'w', Blue: 'u', Black: 'b', Red: 'r', Green: 'g', Colorless: 'c' };

function toIdLetters(colors) {
  const letters = (colors || []).map((c) => COLOR_LETTERS[c]).filter(Boolean);
  // ignore Colorless when mixed with others for identity queries
  const filtered = letters.length > 1 ? letters.filter((l) => l !== 'c') : letters;
  return [...new Set(filtered)].sort().join('');
}

function buildQuery({ colors = [], format = '', commanderOnly = false, q = '' }) {
  const parts = [];
  // Color identity coverage search (id<=wubrg)
  const id = toIdLetters(colors);
  if (id) parts.push(`id<=${id}`);

  // Format legality
  const fmt = FORMAT_MAP[format] || '';
  if (fmt) parts.push(`legal:${fmt}`);

  if (commanderOnly || fmt === 'commander') parts.push('is:commander');

  if (q && typeof q === 'string') parts.push(q.trim());

  return parts.join(' ');
}

async function searchScryfall({ colors, format, commanderOnly, q, order = 'edhrec', unique = 'cards', page = 1 }) {
  const query = buildQuery({ colors, format, commanderOnly, q });
  const url = `${BASE}?q=${encodeURIComponent(query)}&order=${encodeURIComponent(order)}&unique=${encodeURIComponent(unique)}&page=${encodeURIComponent(page)}`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Scryfall error ${r.status}: ${text.slice(0, 200)}`);
  }
  const json = await r.json();
  // Normalize a small subset for the UI
  const cards = (json?.data || []).map((c) => ({
    id: c.id,
    name: c.name,
    type_line: c.type_line,
    colors: c.colors,
    color_identity: c.color_identity,
    scryfall_uri: c.scryfall_uri,
    image_uris: c.image_uris || c.card_faces?.[0]?.image_uris || null,
    prices: c.prices || null,
    oracle_text: c.oracle_text || c.card_faces?.map(f => f.oracle_text).filter(Boolean).join(' // ') || null
  }));
  return { query, request_url: url, has_more: !!json.has_more, next_page: json.next_page || null, total_cards: json.total_cards || cards.length, cards };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST with JSON body.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { colors = [], format = '', commanderOnly = false, q = '', order, unique, page } = body;

    const data = await searchScryfall({ colors, format, commanderOnly, q, order, unique, page });
    // Cache briefly on the edge
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({ ok: true, source: 'scryfall', ...data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}

export const core = { buildQuery, searchScryfall };
