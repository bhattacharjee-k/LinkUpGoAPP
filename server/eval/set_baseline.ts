// Promote the latest 'current' replay report to the regression baseline.
// Run after: `npm run eval:replay -- --pipeline=current`

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.join(__dirname, 'reports');
const BASELINE_PATH = path.join(__dirname, 'golden', 'baseline.json');

function findLatest(prefix: string): string | null {
  if (!fs.existsSync(REPORT_DIR)) return null;
  const files = fs.readdirSync(REPORT_DIR)
    .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('.json'))
    .sort();
  return files.length === 0 ? null : path.join(REPORT_DIR, files[files.length - 1]);
}

const target = process.argv[2] || 'current';
const latest = findLatest(target);
if (!latest) {
  console.error(`[baseline] No '${target}' report in ${REPORT_DIR}.`);
  console.error(`[baseline] Run: npm run eval:replay -- --pipeline=${target}`);
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(latest, 'utf8'));
const baseline = {
  pipeline: report.pipeline,
  metrics: report.metrics,
  timestamp: new Date().toISOString(),
  source: path.basename(latest),
};
if (!fs.existsSync(path.dirname(BASELINE_PATH))) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
}
fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
console.log(`[baseline] Wrote ${BASELINE_PATH} from ${path.basename(latest)}`);
console.log('[baseline] Metrics:', baseline.metrics);
