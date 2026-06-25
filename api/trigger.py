import json
import urllib.request
import urllib.parse

GHL_PIT      = "pit-d977607c-f9e5-4a92-8b48-07d2ea342d79"
GHL_LOCATION = "KDMRygh4EQxW5HYf5SZu"
WF_CALL      = "5a799e8b-34c1-483d-8999-06fa8d3fe0ae"
WF_SMS       = "1803b643-fc48-4f8e-a98a-a7728878320e"

def ghl_req(method, path, body=None, params=None):
    url = "https://services.leadconnectorhq.com" + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {GHL_PIT}")
    req.add_header("Version", "2023-02-21")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def get_or_create_contact(first_name, last_name, phone):
    status, data = ghl_req("GET", "/contacts/search/duplicate",
        params={"locationId": GHL_LOCATION, "number": phone})
    if status == 200:
        contacts = data.get("contacts", [])
        if contacts:
            return contacts[0]["id"], False
    status, data = ghl_req("POST", "/contacts/", {
        "locationId": GHL_LOCATION, "firstName": first_name,
        "lastName": last_name, "phone": phone
    })
    if status in (200, 201):
        cid = data.get("contact", {}).get("id") or data.get("id")
        return cid, True
    if status == 400:
        cid = data.get("meta", {}).get("contactId")
        if cid:
            return cid, False
    return None, False

def add_to_workflow(contact_id, workflow_id):
    status, _ = ghl_req("POST", f"/contacts/{contact_id}/workflow/{workflow_id}",
        {"eventStartTime": None})
    return status in (200, 201, 202), status

def handler(request):
    if request.method == "OPTIONS":
        return Response("", status=200, headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "Content-Type"
        })
    body = json.loads(request.body)
    first_name = body.get("first_name", "")
    last_name  = body.get("last_name", "")
    phone      = body.get("phone", "")
    action     = body.get("action", "both")
    steps = []

    contact_id, created = get_or_create_contact(first_name, last_name, phone)
    if contact_id:
        steps.append({"ok": True, "msg": f"Contact {'created' if created else 'found'}: {contact_id}"})
    else:
        steps.append({"ok": False, "msg": "Failed to create/find contact"})
        return Response(json.dumps({"steps": steps}), status=200,
            headers={"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"})

    if action in ("call", "both"):
        ok, status = add_to_workflow(contact_id, WF_CALL)
        steps.append({"ok": ok, "msg": f"Call workflow: {'OK' if ok else 'FAILED'} ({status})"})

    if action in ("sms", "both"):
        ok, status = add_to_workflow(contact_id, WF_SMS)
        steps.append({"ok": ok, "msg": f"SMS workflow: {'OK' if ok else 'FAILED'} ({status})"})

    return Response(json.dumps({"steps": steps}), status=200,
        headers={"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"})
