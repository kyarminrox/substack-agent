import fs from 'node:fs';
import path from 'node:path';

const RUN_DIR = path.join('playwright', '.runs');
export function appendRun(fileBase: string, obj: Record<string, unknown>): void {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const filePath = path.join(RUN_DIR, `${fileBase}.jsonl`);
  const line = JSON.stringify({ ...obj, t: new Date().toISOString() });
  fs.appendFileSync(filePath, line + '\n', 'utf8');
}

export function readRuns(fileBase: string, max = 50): Array<Record<string, unknown>> {
  const filePath = path.join(RUN_DIR, `${fileBase}.jsonl`);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-max).map(l => JSON.parse(l));
}
