/** Caps how many upstream requests run at once, with a bounded wait
 *  queue. Without it, N concurrent requests for N distinct uncached keys
 *  became N concurrent SPARQL queries against ERA's shared public
 *  endpoint — load an anonymous client could set. */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(
    private readonly maxConcurrent: number,
    private readonly maxQueued: number,
    private readonly onFull: () => Error,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueued) throw this.onFull();
      await new Promise<void>((resolve) => this.queue.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await task();
    } finally {
      // Hand the slot straight to the next waiter (active stays the same),
      // or release it.
      const next = this.queue.shift();
      if (next) next();
      else this.active--;
    }
  }

  get stats() {
    return { active: this.active, queued: this.queue.length };
  }
}
