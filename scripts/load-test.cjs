const { performance } = require('node:perf_hooks');
const [target = 'http://localhost/api/product', countArg = '1000', concurrentArg = '40'] = process.argv.slice(2);
const url = new URL(target);
if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Load tests are restricted to the local service');
const count = Math.min(Math.max(Number(countArg), 1), 50000);
const concurrency = Math.min(Math.max(Number(concurrentArg), 1), 200);
let next = 0, errors = 0;
const statuses = {}, latencies = [];
const start = performance.now();
async function worker() {
    while (next < count) {
        next += 1;
        const before = performance.now();
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
            await response.arrayBuffer();
            statuses[response.status] = (statuses[response.status] || 0) + 1;
            if (![200, 429].includes(response.status)) errors += 1;
        } catch (_error) { errors += 1; }
        latencies.push(performance.now() - before);
    }
}
Promise.all(Array.from({ length: concurrency }, worker)).then(() => {
    latencies.sort((a,b) => a-b);
    const result = { requests: count, concurrency, seconds: Number(((performance.now() - start) / 1000).toFixed(2)), statuses, errors, p95Milliseconds: Math.round(latencies[Math.floor(latencies.length * 0.95)] || 0) };
    console.log(JSON.stringify(result, null, 2));
    if (errors || !statuses[429]) process.exitCode = 1;
});
