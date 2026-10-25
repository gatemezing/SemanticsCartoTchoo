import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "./app.js";
import { replyWithError } from "./errors.js";
import { UpstreamBusyError } from "./sparql/client.js";

// None of these requests reach upstream: each is rejected or answered
// before any SPARQL query is sent.

test("invalid input is a 400 with a clear message, not a 500", async () => {
  const app = await buildApp({ logger: false });
  const op = await app.inject("/api/operational-points/FR1%22%7D%20%23");
  assert.equal(op.statusCode, 400);
  assert.match(op.json().message, /Invalid uopid/);

  const js = await app.inject(`/api/describe?iri=${encodeURIComponent("javascript:alert(1)")}`);
  assert.equal(js.statusCode, 400);
  assert.match(js.json().message, /Invalid IRI/);

  const missing = await app.inject("/api/describe");
  assert.equal(missing.statusCode, 400);

  const country = await app.inject("/api/tunnels?country=FR%22");
  assert.equal(country.statusCode, 400);
  await app.close();
});

test("security headers on every API response", async () => {
  const app = await buildApp({ logger: false });
  for (const url of ["/api/countries", "/api/describe?iri=bad"]) {
    const res = await app.inject(url);
    assert.equal(res.headers["x-content-type-options"], "nosniff", url);
    assert.equal(res.headers["referrer-policy"], "no-referrer", url);
    assert.equal(res.headers["x-frame-options"], "DENY", url);
    assert.match(String(res.headers["content-security-policy"]), /default-src 'none'/, url);
  }
  await app.close();
});

test("no CORS headers unless origins are configured", async () => {
  const closed = await buildApp({ logger: false, corsOrigins: [] });
  const res = await closed.inject({ url: "/api/countries", headers: { origin: "https://evil.example" } });
  assert.equal(res.headers["access-control-allow-origin"], undefined);
  await closed.close();
});

test("configured CORS only reflects allowed origins", async () => {
  const app = await buildApp({ logger: false, corsOrigins: ["https://user.github.io"] });
  const ok = await app.inject({ url: "/api/countries", headers: { origin: "https://user.github.io" } });
  assert.equal(ok.headers["access-control-allow-origin"], "https://user.github.io");
  const evil = await app.inject({ url: "/api/countries", headers: { origin: "https://evil.example" } });
  assert.notEqual(evil.headers["access-control-allow-origin"], "https://evil.example");
  await app.close();
});

test("rate limit answers 429 in the API envelope", async () => {
  const app = await buildApp({ logger: false, rateLimitPerMinute: 3 });
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await app.inject("/api/countries")).statusCode);
  assert.deepEqual(codes, [200, 200, 200, 429]);
  const limited = await app.inject("/api/countries");
  assert.equal(limited.json().status, "error");
  assert.match(limited.json().message, /Too many requests/);
  // Health checks are exempt, so orchestration keeps working under a flood.
  assert.equal((await app.inject("/api/health")).statusCode, 200);
  await app.close();
});

test("lookup routes have a tighter per-client budget", async () => {
  const app = await buildApp({ logger: false, rateLimitPerMinute: 1000 });
  let firstLimited = -1;
  for (let i = 0; i < 70 && firstLimited < 0; i++) {
    const res = await app.inject("/api/describe?iri=bad");
    if (res.statusCode === 429) firstLimited = i;
  }
  assert.equal(firstLimited, 60);
  await app.close();
});

test("behind a trusted proxy, each client gets its own budget", async () => {
  const app = await buildApp({ logger: false, rateLimitPerMinute: 2, trustProxy: true });
  const as = (ip: string) => app.inject({ url: "/api/countries", headers: { "x-forwarded-for": ip } });
  assert.equal((await as("203.0.113.1")).statusCode, 200);
  assert.equal((await as("203.0.113.1")).statusCode, 200);
  assert.equal((await as("203.0.113.1")).statusCode, 429);
  assert.equal((await as("203.0.113.2")).statusCode, 200);
  await app.close();
});

test("upstream saturation maps to 503, unknown errors hide their details", () => {
  const codes: number[] = [];
  const reply = { code: (c: number) => { codes.push(c); return reply; } };
  const request = { log: { error: () => {} } };
  const busy = replyWithError(request as never, reply as never, new UpstreamBusyError(), "fallback");
  const internal = replyWithError(request as never, reply as never, new Error("secret stack detail"), "fallback");
  assert.deepEqual(codes, [503, 500]);
  assert.match((busy as { message: string }).message, /Too many RINF queries/);
  assert.equal((internal as { message: string }).message, "fallback");
});
