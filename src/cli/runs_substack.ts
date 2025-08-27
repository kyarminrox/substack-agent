import { readRuns } from '../infra/runs.js';

async function main() {
  const items = readRuns('substack-drafts', 50);
  if (items.length === 0) {
    console.log('No saved Substack drafts yet.');
    return;
  }
  for (const it of items) {
    const id = String(it.id ?? '');
    const url = String(it.editUrl ?? '');
    const title = String(it.title ?? '');
    const t = String(it.t ?? '');
    console.log(`${t}  ${id}  ${title}  ${url}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
