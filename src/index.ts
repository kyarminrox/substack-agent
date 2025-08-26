import { run } from './workflows/publish_blog.js';

async function main() {
  console.log('🚀 Agent starting (v0.1 scaffold)…');
  await run();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
