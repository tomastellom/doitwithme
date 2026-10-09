import { existsSync } from 'node:fs';
import { formatPlan } from './format.ts';
import { replan } from './replan.ts';
import { loadState, saveState } from './store.ts';

const args = process.argv.slice(2);
const save = args.includes('--save');
const file = args.find((a) => !a.startsWith('--')) ?? 'data/db.json';

if (!existsSync(file)) {
  console.log(`No data file at ${file}.`);
  console.log('Start from the example:  mkdir -p data && cp examples/sample-state.json data/db.json');
  process.exit(1);
}

const now = new Date();
const pad = (n: number): string => String(n).padStart(2, '0');
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const nowMinutes = now.getHours() * 60 + now.getMinutes();
const horizonDays = 14;

const result = replan(loadState(file), today, nowMinutes, horizonDays);
console.log(formatPlan(result.state.commitments, result.state.blocks, result.warnings, today, horizonDays));
if (save) {
  saveState(file, result.state);
  console.log(`\nSaved the plan to ${file}.`);
}
