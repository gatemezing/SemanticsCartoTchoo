import assert from "node:assert/strict";
import { test } from "node:test";
import { ConcurrencyLimiter } from "./limiter.js";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("never runs more than maxConcurrent tasks at once", async () => {
  const limiter = new ConcurrencyLimiter(3, 100, () => new Error("full"));
  let running = 0;
  let peak = 0;
  await Promise.all(
    Array.from({ length: 20 }, () =>
      limiter.run(async () => {
        running++;
        peak = Math.max(peak, running);
        await tick(5);
        running--;
      }),
    ),
  );
  assert.equal(peak, 3);
  assert.deepEqual(limiter.stats, { active: 0, queued: 0 });
});

test("rejects once the wait queue is full, and recovers after", async () => {
  const limiter = new ConcurrencyLimiter(1, 2, () => new Error("full"));
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () => limiter.run(() => tick(5))),
  );
  assert.deepEqual(
    results.map((r) => r.status),
    ["fulfilled", "fulfilled", "fulfilled", "rejected", "rejected"],
  );
  await assert.doesNotReject(limiter.run(async () => 1));
});

test("a failing task releases its slot", async () => {
  const limiter = new ConcurrencyLimiter(1, 0, () => new Error("full"));
  await assert.rejects(limiter.run(async () => { throw new Error("boom"); }), /boom/);
  assert.equal(await limiter.run(async () => 42), 42);
});
