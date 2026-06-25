const https = require('https');

const GHL_PIT      = 'pit-d977607c-f9e5-4a92-8b48-07d2ea342d79';
const GHL_LOCATION = 'KDMRygh4EQxW5HYf5SZu';
const SUPA_URL     = 'inxwustdvklxopwqhqkk.supabase.co';
const SUPA_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlueHd1c3RkdmtseG9wd3FocWtrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODY1OTMxNywiZXhwIjoyMDc0MjM1MzE3fQ.MMfFCCpNVg5i-QKW6Iy7FqVCD-KzxPhxG3Ddep9OJQw';

function req(hostname, path, method, headers, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { hostname, path, method, headers: {...headers, ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})} };
    const r = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({status: res.statusCode, body: JSON.parse(d)}); } catch { resolve({status: res.statusCode, body: {}}); }});
    });
    r.on('error', () => resolve({status: 500, body: {}}));
    if (data) r.write(data);
    r.end();
  });
}

module.exports = async (request, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') return res.status(200).end();

  const {phone} = request.body;
  const steps = [];

  // 1. Find GHL contact
  const search = await req('services.leadconnectorhq.com',
    `/contacts/search/duplicate?locationId=${GHL_LOCATION}&number=${encodeURIComponent(phone)}`,
    'GET', {'Authorization': `Bearer ${GHL_PIT}`, 'Version': '2023-02-21', 'Content-Type': 'application/json'});

  const contacts = search.body.contacts || [];
  if (contacts.length === 0) {
    steps.push({ok: true, msg: 'GHL: no contact found (already clean)'});
  } else {
    for (const c of contacts) {
      const del = await req('services.leadconnectorhq.com', `/contacts/${c.id}`, 'DELETE',
        {'Authorization': `Bearer ${GHL_PIT}`, 'Version': '2023-02-21', 'Content-Type': 'application/json'});
      steps.push({ok: del.status === 200, msg: `GHL contact ${c.id}: ${del.status === 200 ? 'deleted' : 'FAILED (' + del.status + ')'}`});
    }
  }

  // 2. Delete Supabase rows
  const encoded = encodeURIComponent(phone);
  const supa = await req(SUPA_URL, `/rest/v1/sms_history?sender_id=eq.${encoded}`, 'DELETE',
    {'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json'});
  steps.push({ok: supa.status === 204, msg: `Supabase history: ${supa.status === 204 ? 'cleared' : 'FAILED (' + supa.status + ')'}`});

  res.json({steps});
};
