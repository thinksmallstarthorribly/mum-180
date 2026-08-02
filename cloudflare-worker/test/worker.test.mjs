import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

class MemoryKV {
  constructor() {
    this.entries = new Map();
  }

  async get(key) {
    return this.entries.has(key) ? this.entries.get(key).value : null;
  }

  async put(key, value, options = {}) {
    this.entries.set(key, { value, metadata: options.metadata });
  }
}

function makeEnv() {
  return {
    ACCESS_CODES: new MemoryKV(),
    ADMIN_SECRET: "test-admin-secret",
    ALLOWED_ORIGIN: "https://mum180.com",
  };
}

function request(path, options = {}) {
  const method = options.method || "POST";
  const init = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = options.body === undefined ? JSON.stringify({}) : options.body;
  }
  return new Request(`https://mum180-access.example.workers.dev${path}`, init);
}

test("validate reports true only for a code stored in KV", async () => {
  const env = makeEnv();
  await env.ACCESS_CODES.put("code:TESTVALIDCODE", JSON.stringify({ code: "TESTVALIDCODE" }));

  const validResponse = await worker.fetch(request("/validate", { body: JSON.stringify({ code: "test valid code" }) }), env);
  assert.equal(validResponse.status, 200);
  assert.deepEqual(await validResponse.json(), { valid: true });

  const invalidResponse = await worker.fetch(request("/validate", { body: JSON.stringify({ code: "not-a-code" }) }), env);
  assert.equal(invalidResponse.status, 200);
  assert.deepEqual(await invalidResponse.json(), { valid: false });
});

test("add-code requires the admin secret and stores a normalised code", async () => {
  const env = makeEnv();

  const denied = await worker.fetch(request("/add-code", { body: JSON.stringify({ code: "NEW-CODE" }) }), env);
  assert.equal(denied.status, 401);

  const created = await worker.fetch(
    request("/add-code", {
      headers: { Authorization: "Bearer test-admin-secret" },
      body: JSON.stringify({ code: " new code ", email: "buyer@example.com", source: "stripe-webhook" }),
    }),
    env,
  );
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { success: true, code: "NEWCODE" });
  assert.notEqual(await env.ACCESS_CODES.get("code:NEWCODE"), null);
});

test("browser requests from origins other than mum180.com are rejected", async () => {
  const env = makeEnv();
  const response = await worker.fetch(
    request("/validate", {
      headers: { Origin: "https://untrusted.example" },
      body: JSON.stringify({ code: "TESTVALIDCODE" }),
    }),
    env,
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Origin not allowed." });
});

test("malformed JSON and unsupported methods return safe client errors", async () => {
  const env = makeEnv();
  const malformed = await worker.fetch(request("/validate", { body: "{" }), env);
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).valid, false);

  const getResponse = await worker.fetch(request("/validate", { method: "GET", body: undefined }), env);
  assert.equal(getResponse.status, 405);
});
