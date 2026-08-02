const CODE_PREFIX = "code:";
const MAX_CODE_LENGTH = 128;

/**
 * Mum 180 access-code validator.
 *
 * Required bindings:
 * - ACCESS_CODES: Cloudflare KV namespace
 * - ADMIN_SECRET: encrypted Cloudflare Worker secret
 * - ALLOWED_ORIGIN: https://mum180.com
 */

function normaliseCode(value) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase().replace(/\s+/g, "");
  if (!code || code.length > MAX_CODE_LENGTH) return null;
  return code;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = env.ALLOWED_ORIGIN || "https://mum180.com";
  const headers = {
    "Content-Type": "application/json; charset=UTF-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };

  if (origin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Max-Age"] = "86400";
  }

  return headers;
}

function isAllowedBrowserOrigin(request, env) {
  const origin = request.headers.get("Origin");
  return !origin || origin === (env.ALLOWED_ORIGIN || "https://mum180.com");
}

function json(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders(request, env),
  });
}

function methodNotAllowed(request, env) {
  return new Response(JSON.stringify({ error: "Method not allowed." }), {
    status: 405,
    headers: {
      ...corsHeaders(request, env),
      "Allow": "POST, OPTIONS",
    },
  });
}

async function parseJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { error: "Expected an application/json request body." };
  }

  try {
    return { value: await request.json() };
  } catch {
    return { error: "Request body must contain valid JSON." };
  }
}

function secureEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function readBearerToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function validateCode(request, env) {
  const parsed = await parseJson(request);
  if (parsed.error) return json(request, env, { valid: false, error: parsed.error }, 400);

  const code = normaliseCode(parsed.value?.code);
  if (!code) return json(request, env, { valid: false }, 200);

  try {
    const record = await env.ACCESS_CODES.get(`${CODE_PREFIX}${code}`);
    return json(request, env, { valid: record !== null }, 200);
  } catch (error) {
    console.error("KV validation read failed", error);
    return json(request, env, { valid: false, error: "Validation service is temporarily unavailable." }, 503);
  }
}

async function addCode(request, env) {
  const suppliedSecret = readBearerToken(request);
  if (!env.ADMIN_SECRET || !secureEqual(suppliedSecret, env.ADMIN_SECRET)) {
    return json(request, env, { error: "Unauthorized." }, 401);
  }

  const parsed = await parseJson(request);
  if (parsed.error) return json(request, env, { error: parsed.error }, 400);

  const code = normaliseCode(parsed.value?.code);
  if (!code) {
    return json(request, env, { error: "A non-empty access code of 128 characters or fewer is required." }, 400);
  }

  const email = typeof parsed.value?.email === "string" ? parsed.value.email.trim().slice(0, 320) : "";
  const source = typeof parsed.value?.source === "string" ? parsed.value.source.trim().slice(0, 100) : "webhook";
  const record = {
    code,
    email: email || null,
    source: source || "webhook",
    createdAt: new Date().toISOString(),
  };

  try {
    await env.ACCESS_CODES.put(`${CODE_PREFIX}${code}`, JSON.stringify(record), {
      metadata: {
        email: record.email,
        source: record.source,
        createdAt: record.createdAt,
      },
    });
    return json(request, env, { success: true, code }, 201);
  } catch (error) {
    console.error("KV code write failed", error);
    return json(request, env, { error: "Could not store the access code." }, 503);
  }
}

export default {
  async fetch(request, env) {
    if (!isAllowedBrowserOrigin(request, env)) {
      return json(request, env, { error: "Origin not allowed." }, 403);
    }

    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    if (request.method !== "POST") {
      return methodNotAllowed(request, env);
    }

    if (url.pathname === "/validate") return validateCode(request, env);
    if (url.pathname === "/add-code") return addCode(request, env);

    return json(request, env, { error: "Not found." }, 404);
  },
};
