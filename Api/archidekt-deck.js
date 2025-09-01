// Fetch a single Archidekt deck by ID (optionally the "small" variant)
const ARCHIDEKT_BASE = 'https://archidekt.com/api';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, small } = req.query || {};
  if (!id) return res.status(400).json({ ok: false, error: 'Missing deck id' });

  const path = small ? `/decks/${id}/small/` : `/decks/${id}/`;
  const url = `${ARCHIDEKT_BASE}${path}`;

  try {
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) return res.status(r.status).json({ ok: false, error: `Archidekt responded ${r.status}` });
    const json = await r.json();
    res.setHeader('Cache-Control', 's-maxage=600');
    return res.status(200).json({ ok: true, deck: json, url });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
