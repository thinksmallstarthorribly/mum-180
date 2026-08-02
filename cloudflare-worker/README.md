# Mum 180 Access Validator

This directory contains the Cloudflare Worker that replaces the public browser-side access-code list. The Worker stores code records in Cloudflare KV, validates codes through `POST /validate`, and accepts new codes through a protected `POST /add-code` endpoint.

> The Worker source contains **no access codes and no admin secret**. Keep the supplied private seed JSON and admin-secret handover file outside Git. The local ignore rules in this folder prevent common secret-file names from being committed.

## Files

| File | Purpose |
|---|---|
| `src/index.js` | Worker request handler and KV access logic. |
| `wrangler.toml` | Worker name, production origin, and the `ACCESS_CODES` KV binding. |
| `scripts/seed-codes.mjs` | Sends initial code records to the protected Worker endpoint. |
| `seed-codes.example.json` | Safe format example only. It contains no usable code. |
| `test/worker.test.mjs` | Local request-behaviour tests. |

## Endpoint contract

| Endpoint | Authentication | Request body | Success response |
|---|---|---|---|
| `POST /validate` | None. Browser origin is restricted to `https://mum180.com`. | `{"code":"BUYER-CODE"}` | `{"valid":true}` or `{"valid":false}` |
| `POST /add-code` | `Authorization: Bearer <ADMIN_SECRET>` | `{"code":"BUYER-CODE","email":"buyer@example.com","source":"stripe-webhook"}` | `{"success":true,"code":"BUYER-CODE"}` |

Codes are normalised to uppercase with all whitespace removed before storage and validation. The public validation endpoint never returns the stored code list.

## Deployment checklist

### 1. Install dependencies and authenticate

Open a terminal in this directory and run the following commands. Use the Cloudflare account that owns the `mum180-access-codes` KV namespace.

```bash
cd cloudflare-worker
npm install
npx wrangler login
```

### 2. Deploy the Worker

The repository configuration already binds the Worker to the dedicated `mum180-access-codes` KV namespace. Deploy it with:

```bash
npm run deploy
```

Wrangler will print a URL in this format:

```text
https://mum180-access.YOUR-SUBDOMAIN.workers.dev
```

Copy that URL. Do not add `/validate` to the Worker setting itself; the website appends the endpoint path in `access.html`.

### 3. Add the admin secret securely

Use the private `mum180_cloudflare_admin_secret.txt` handover file supplied with this work. Do **not** paste the secret into `wrangler.toml`, source files, or GitHub.

```bash
npx wrangler secret put ADMIN_SECRET
```

When prompted, paste the entire secret once and press Enter. Cloudflare stores Worker secrets as encrypted bindings rather than plaintext configuration values.[1]

### 4. Seed the six existing codes

Copy the supplied private `mum180_seed_codes.json` into this `cloudflare-worker` directory as `.seed-codes.json`. It is ignored by Git. Then run:

```bash
export WORKER_URL="https://mum180-access.YOUR-SUBDOMAIN.workers.dev"
read -rsp "Admin secret: " ADMIN_SECRET; echo
export ADMIN_SECRET
npm run seed
unset ADMIN_SECRET
```

The seed script adds the six retained codes through the same authenticated endpoint used by the purchase webhook. It exits with a non-zero status if any insert fails.

### 5. Test the deployed service

Use an invalid code first. A successful request returns HTTP 200 and `{"valid":false}`.

```bash
curl -i -X POST "$WORKER_URL/validate" \
  -H "Content-Type: application/json" \
  --data '{"code":"NOT-A-REAL-CODE"}'
```

Then test one of the private seeded codes. It should return `{"valid":true}` after the seed step. Do not paste a real code into this public README or commit it to Git.

```bash
curl -i -X POST "$WORKER_URL/validate" \
  -H "Content-Type: application/json" \
  --data '{"code":"PASTE-A-PRIVATE-SEEDED-CODE-HERE"}'
```

### 6. Set the real website endpoint

The updated `access.html` is provided as `access-html-server-side.html` within this Worker package. After deploying the Worker and obtaining its URL, perform the following steps:

1.  **Rename the file:** Rename `access-html-server-side.html` to `access.html` in the root of your `mum-180` repository.
2.  **Update the endpoint URL:** Edit the new `access.html` and replace only `YOUR-SUBDOMAIN` in the `VALIDATION_ENDPOINT` constant with the subdomain Wrangler printed during deployment (e.g., `https://mum180-access.YOUR-SUBDOMAIN.workers.dev/validate`).
3.  **Commit and push:** Commit and push this updated `access.html` to your `main` branch.

## Stripe purchase webhook integration

The existing VM already generates a unique code and emails it after a successful Stripe purchase. Immediately after that generation step, add one server-side request to the Worker. Store both values as environment variables on the VM, not in the VM source repository:

```js
const response = await fetch(`${process.env.MUM180_WORKER_URL}/add-code`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.MUM180_WORKER_ADMIN_SECRET}`,
  },
  body: JSON.stringify({
    code: generatedAccessCode,
    email: stripeCustomerEmail || null,
    source: "stripe-webhook",
  }),
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Mum 180 access-code add failed: ${response.status} ${body}`);
}
```

The webhook handler should call the Worker **before** treating fulfilment as complete. If it receives a non-2xx response, log the failure with the Stripe event ID and retry safely. Re-sending the same code is safe because the Worker overwrites the same KV key.

## Security and operations

The browser now receives only `true` or `false`; it never receives the code list or the admin secret. KV access is made available to the Worker through a named binding configured in `wrangler.toml`.[2] The `ADMIN_SECRET` must be stored as a Cloudflare secret and in the VM environment only. If it is ever exposed, replace it with `npx wrangler secret put ADMIN_SECRET` and update the VM's environment value at the same time.

The validation endpoint uses a restrictive CORS policy for `https://mum180.com`. CORS prevents other browser origins from reading its responses, but it is not an authentication system. Keep buyer codes high-entropy and unique, and do not rely on CORS alone to protect administrative operations.

## References

[1] [Cloudflare Workers secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/)

[2] [Cloudflare Workers KV binding documentation](https://developers.cloudflare.com/kv/concepts/kv-bindings/)
