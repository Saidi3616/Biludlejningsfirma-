// Belastningstest af ledighedssøgningen (M17). Kører mod en kørende server, aldrig production
// uden aftale: hver søgning rammer databasen.
//
//   node scripts/load-test.mjs [base-url] [samtidige] [sekunder]
//   node scripts/load-test.mjs http://localhost:3000 10 30
//
// Fejler (exit 1), hvis et svar ikke er 200, eller hvis 95 % af svarene er langsommere end
// grænsen (P95_LIMIT_MS, standard 1500 ms).

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const concurrency = Number(process.argv[3] ?? 10);
const seconds = Number(process.argv[4] ?? 30);
const p95Limit = Number(process.env.P95_LIMIT_MS ?? 1500);

const locations = ["koebenhavn", "koebenhavns-lufthavn", "aarhus", "odense"];
const cars = ["volkswagen-golf", "kia-picanto-automatic", "toyota-corolla-hybrid", "volvo-xc60"];

/** En tilfældig hverdagsperiode 30–400 dage ude (kontorerne har åbent kl. 10). */
function period() {
  const date = new Date(Date.now() + (30 + Math.floor(Math.random() * 370)) * 86_400_000);
  while (![1, 2, 3, 4].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  const pickup = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 1 + Math.floor(Math.random() * 6));
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  const location = locations[Math.floor(Math.random() * locations.length)];
  return `location=${location}&pickupDate=${pickup}&pickupTime=10:00&returnDate=${date
    .toISOString()
    .slice(0, 10)}&returnTime=10:00`;
}

/** Halvdelen søger i kataloget, halvdelen tjekker én bil. */
function nextUrl() {
  if (Math.random() < 0.5) return `${base}/cars?${period()}`;
  const car = cars[Math.floor(Math.random() * cars.length)];
  return `${base}/cars/${car}?${period()}`;
}

const timings = [];
const failures = new Map();
const deadline = Date.now() + seconds * 1000;

async function worker(id) {
  while (Date.now() < deadline) {
    const started = performance.now();
    try {
      const response = await fetch(nextUrl(), {
        headers: { "accept-language": "da", "x-forwarded-for": `10.0.${id}.1` },
      });
      await response.arrayBuffer();
      if (response.status !== 200) {
        failures.set(response.status, (failures.get(response.status) ?? 0) + 1);
      }
    } catch (error) {
      const key = error.cause?.code ?? error.name;
      failures.set(key, (failures.get(key) ?? 0) + 1);
    }
    timings.push(performance.now() - started);
  }
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

console.log(`Belastningstest: ${base}, ${concurrency} samtidige i ${seconds} s`);
await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));

const sorted = [...timings].sort((a, b) => a - b);
const errors = [...failures.values()].reduce((sum, n) => sum + n, 0);
const p95 = percentile(sorted, 95);
const result = {
  requests: sorted.length,
  perSecond: Math.round(sorted.length / seconds),
  p50: Math.round(percentile(sorted, 50)),
  p95: Math.round(p95),
  p99: Math.round(percentile(sorted, 99)),
  max: Math.round(sorted.at(-1) ?? 0),
  errors,
  failures: Object.fromEntries(failures),
};
console.table(result);
if (errors > 0 || p95 > p95Limit) {
  console.error(`FEJL: ${errors} fejl, p95 ${Math.round(p95)} ms (grænse ${p95Limit} ms)`);
  process.exit(1);
}
console.log("OK");
