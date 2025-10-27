const { httpGet } = require('./mock-http-interface');

// Concurrency: get the concurrent number setting from env, default to 10
const MAX_CONCURRENCY = parseInt(process.env.MAX_CONCURRENCY) || 10;


/**
 * Transform an HTTP response to the required result shape.
 * @param {{ status: number, body: string }} response
 * @returns {{ 'Arnie Quote'?: string, FAILURE?: string }}
 */
const transformResponse = (response) => {
  let payload = {};
  let message = 'Invalid response format';
  
  try {
    payload = JSON.parse((response && response.body) || '{}') || {};
    message = payload.message || message;
  } catch (_) {
    // Keep default message
  }

  if (response && response.status === 200) {
    return { 'Arnie Quote': message };
  }
  return { FAILURE: message };
};

/**
 * Create a small concurrency-limited runner that processes tasks by index and
 * preserves output order.
 * @template T
 * @param {number} count Number of tasks
 * @param {(index: number) => Promise<T>} worker Async worker per index
 * @param {number} limit Max number of concurrent workers
 * @returns {Promise<T[]>}
 */
const runWithConcurrency = (count, worker, limit=MAX_CONCURRENCY) => {
  const results = new Array(count);
  if (count === 0) return Promise.resolve(results);

  const concurrencyNumber = Math.min(limit || MAX_CONCURRENCY, count);
  let nextIndex = 0;
  let active = 0;

  return new Promise((resolve) => {
    const launchNext = () => {
      // Resolve when all tasks are scheduled (nextIndex >= count) AND no workers are active
      if (nextIndex >= count) {
        if (active === 0) resolve(results);
        return;
      }

      const i = nextIndex++;
      active++;
      worker(i)
        // Store the result of this worker, index (i) is enclosed
        .then((value) => {
          results[i] = value;
        })
        .catch((err) => {
          // Map any unexpected error to a FAILURE result
          const message = err && err.message ? err.message : 'Unknown error';
          results[i] = { FAILURE: message };
        })
        .finally(() => {
          active--;
          // Rollup the next worker
          launchNext();
        });
    };

    // Init the pool to put the concurrencyNumber workers in
    for (let k = 0; k < concurrencyNumber; k++) {
      launchNext();
    }
  });
};

/**
 * Executes a HTTP GET request on each of the URLs, transforms each response
 * according to the requirements and returns the ordered results.
 *
 * @param {string[]} urls The urls to be requested
 * @returns {Promise<Array<{ 'Arnie Quote'?: string, FAILURE?: string }>>}
 */
const getArnieQuotes = (urls) => {
  const total = Array.isArray(urls) ? urls.length : 0;
  
  // Early return for empty input
  if (total === 0) {
    return Promise.resolve([]);
  }

  const worker = async (i) => {
    try {
      const response = await httpGet(urls[i]);
      return transformResponse(response);
    } catch (err) {
      const message = err && err.message ? err.message : 'Unknown error';
      return { FAILURE: message };
    }
  };

  return runWithConcurrency(total, worker);
};

module.exports = {
  getArnieQuotes,
};
