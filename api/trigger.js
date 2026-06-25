const https = require('https');

const GHL_PIT      = 'pit-d977607c-f9e5-4a92-8b48-07d2ea342d79';
const GHL_LOCATION = 'KDMRygh4EQxW5HYf5SZu';
const WF_CALL      = '5a799e8b-34c1-483d-8999-06fa8d3fe0ae';
const WF_SMS       = '1803b643-fc48-4f8e-a98a-a7728878320e';

function ghlReq(method, path, body, params) {
  return new Promise((resolve) => {
    let url = 'services.leadconnectorhq.com';
    let fullPath = path;
    if (params) fullPath += '?' + new URLSearchParams(params).toString();
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url, path: fullPath, method,
      headers: {
        'Authorization': `Bearer ${GHL_PIT}`,
        'Version': '2023-02-21',
        'Content-Type': 'application/json',
        ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})
      }
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve({status: res.statusCode, body: JSON.parse(d)}); } catch { resolve({status: res.statusCode, body: {}}); }});
    });
    req.on('error', () => resolve({status: 500, body: {}}));
    if (data) req.write(data);
    req.end();
  });
}

async function getOrCreate(firstName, lastName, phone) {
  const s = await ghlReq('GET', '/contacts/search/duplicate', null, {locationId: GHL_LOCATION, number: phone});
  if (s.status === 200 && s.body.contacts?.length) return [s.body.contacts[0].id, false];
  const c = await ghlReq('POST', '/contacts/', {locationId: GHL_LOCATION, firstName, lastName, phone});
  if ([200,201].includes(c.status)) return [c.body.contact?.id || c.body.id, true];
  if (c.status === 400 && c.body.meta?.contactId) return [c.body.meta.contactId, false];
  return [null, false];
}

async function addToWf(contactId, wfId) {
  const r = await ghlReq('POST', `/contacts/${contactId}/workflow/${wfId}`, {eventStartTime: null});
  return [r.status >= 200 && r.status < 300, r.status];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const {first_name, last_name, phone, action} = req.body;
  const steps = [];

  const [contactId, created] = await getOrCreate(first_name, last_name || '', phone);
  if (!contactId) {
    steps.push({ok: false, msg: 'Failed to create/find contact'});
    return res.json({steps});
  }
  steps.push({ok: true, msg: `Contact ${created ? 'created' : 'found'}: ${contactId}`});

  if (['call','both'].includes(action)) {
    const [ok, st] = await addToWf(contactId, WF_CALL);
    steps.push({ok, msg: `Call workflow: ${ok ? 'OK' : 'FAILED'} (${st})`});
  }
  if (['sms','both'].includes(action)) {
    const [ok, st] = await addToWf(contactId, WF_SMS);
    steps.push({ok, msg: `SMS workflow: ${ok ? 'OK' : 'FAILED'} (${st})`});
  }
  res.json({steps});
};
