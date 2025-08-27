export type RetryOpts = {
  attempts?: number;       // default 3
  delayMs?: number;        // base backoff, default 400ms
  factor?: number;         // exponential factor, default 2
  jitter?: boolean;        // randomize delay ±50%
};

export async function retry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.delayMs ?? 400;
  const factor = opts.factor ?? 2;
  const jitter = opts.jitter ?? true;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (i === attempts - 1) break;
      const factorDelay = base * Math.pow(factor, i);
      const delay = jitter ? factorDelay * (0.5 + Math.random()) : factorDelay;
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw lastErr;
}
