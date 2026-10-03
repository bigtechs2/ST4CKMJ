import logger from '../../shared/logger.js';

const log = logger.child('delay');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function jitter(baseMs, rangeMs = 1000) {
  const offset = Math.floor(Math.random() * rangeMs);
  return baseMs + offset;
}

function randomBetween(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function backoff(attempt, baseMs = 1000, maxMs = 60000, factor = 2) {
  const raw = baseMs * Math.pow(factor, Math.max(0, attempt - 1));
  return Math.min(raw, maxMs);
}

async function sleepJitter(baseMs, rangeMs) {
  const wait = jitter(baseMs, rangeMs);
  await sleep(wait);
  return wait;
}

async function withTimeout(promise, ms, timeoutReason = 'timeout') {
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutReason));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function retry(fn, {
  attempts = 3,
  baseMs = 1000,
  maxMs = 15000,
  factor = 2,
  jitterMs = 500,
  onError = null,
  silent = true
} = {}) {
  let lastError = null;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastError = err;

      if (onError) {
        try { onError(err, i); } catch {}
      }

      if (i >= attempts) break;

      const delay = backoff(i, baseMs, maxMs, factor) + randomBetween(0, jitterMs);

      if (!silent) {
        log.debug(`Retry ${i}/${attempts} after ${delay}ms — ${err.message}`);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

function throttle(fn, intervalMs) {
  let last = 0;
  let pending = null;

  return function throttled(...args) {
    const now = Date.now();
    const elapsed = now - last;

    if (elapsed >= intervalMs) {
      last = now;
      return fn.apply(this, args);
    }

    if (pending) clearTimeout(pending);

    pending = setTimeout(() => {
      last = Date.now();
      pending = null;
      fn.apply(this, args);
    }, intervalMs - elapsed);
  };
}

function debounce(fn, waitMs) {
  let timer = null;

  return function debounced(...args) {
    if (timer) clearTimeout(timer);

    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, waitMs);
  };
}

function createQueue({ concurrency = 1, intervalMs = 0 } = {}) {
  const queue = [];
  let active = 0;

  function next() {
    if (!queue.length || active >= concurrency) return;

    active += 1;
    const task = queue.shift();

    Promise.resolve()
      .then(task.fn)
      .then((result) => task.resolve(result))
      .catch((err) => task.reject(err))
      .finally(async () => {
        if (intervalMs) await sleep(intervalMs);
        active -= 1;
        next();
      });
  }

  function add(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  }

  return {
    add,
    size: () => queue.length,
    active: () => active,
    clear: () => { queue.length = 0; }
  };
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function measure(fn) {
  const start = Date.now();
  const result = await fn();
  return { result, ms: Date.now() - start };
}

async function retryUntil(fn, condition, {
  attempts = 10,
  intervalMs = 1000,
  timeoutMs = 60000
} = {}) {
  const start = Date.now();

  for (let i = 1; i <= attempts; i++) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('retryUntil: timeout exceeded');
    }

    const value = await fn(i);

    if (condition(value)) return value;

    if (i < attempts) await sleep(intervalMs);
  }

  throw new Error('retryUntil: max attempts reached');
}

async function stagger(items, { batchSize = 5, delayMs = [3000, 10000], fn } = {}) {
  const results = [];
  const [minDelay, maxDelay] = Array.isArray(delayMs) ? delayMs : [delayMs, delayMs];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          return await fn(item);
        } catch (err) {
          return { error: err.message };
        }
      })
    );

    results.push(...batchResults);

    if (i + batchSize < items.length) {
      await sleep(randomBetween(minDelay, maxDelay));
    }
  }

  return results;
}

function rateLimiter({ maxPerMinute = 20 } = {}) {
  const windowMs = 60 * 1000;
  const timestamps = [];

  return async function limit() {
    const now = Date.now();

    while (timestamps.length && now - timestamps[0] > windowMs) {
      timestamps.shift();
    }

    if (timestamps.length >= maxPerMinute) {
      const oldest = timestamps[0];
      const waitMs = windowMs - (now - oldest) + 50;
      await sleep(waitMs);
      return limit();
    }

    timestamps.push(Date.now());
    return true;
  };
}

export {
  sleep,
  jitter,
  randomBetween,
  backoff,
  sleepJitter,
  withTimeout,
  retry,
  retryUntil,
  throttle,
  debounce,
  createQueue,
  nextTick,
  measure,
  stagger,
  rateLimiter
};

export default {
  sleep,
  jitter,
  randomBetween,
  backoff,
  sleepJitter,
  withTimeout,
  retry,
  retryUntil,
  throttle,
  debounce,
  createQueue,
  nextTick,
  measure,
  stagger,
  rateLimiter
};