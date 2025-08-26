import { MediumDriver } from '../drivers/medium.driver.js';

async function main() {
  const title = process.argv[2] || 'Hello from substack-agent';
  const html = process.argv[3] || '<h1>Hello</h1><p>This is a draft created by the agent.</p>';
  const canonicalUrl = process.argv[4]; // optional
  const tags = (process.argv[5]?.split(',') || []).filter(Boolean);

  const driver = new MediumDriver();
  await driver.ensureAuth();
  const out = await driver.createDraft({ title, html, canonicalUrl, tags });
  console.log('Draft created on Medium:', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
