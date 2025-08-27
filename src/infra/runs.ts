import fs from 'node:fs';
import path from 'node:path';

const RUN_DIR = path.join('playwright', '.runs');

export type RunMeta = Record<string, unknown> & {
  provider?: string;
  model?: string;
  prompt?: string;
};

export function appendRun(fileBase: string, obj: RunMeta): void {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const filePath = path.join(RUN_DIR, `${fileBase}.jsonl`);
  const line = JSON.stringify({ ...obj, t: new Date().toISOString() });
  fs.appendFileSync(filePath, line + '\n', 'utf8');
}

export function readRuns(fileBase: string, max = 50): Array<RunMeta> {
  const filePath = path.join(RUN_DIR, `${fileBase}.jsonl`);
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean);
  return lines.slice(-max).map(l => JSON.parse(l));
}
