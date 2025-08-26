import { SubstackDriver } from '../drivers/substack.driver.js';

async function main() {
  const cmd = process.argv[2];
  const driver = new SubstackDriver();
  await driver.ensureAuth();

  if (cmd === 'draft') {
    const title = process.argv[3] || 'Title';
    const html = process.argv[4] || '<p>Body</p>';
    const tags = (process.argv[5]?.split(',') || []).filter(Boolean);
    const out = await driver.createDraft({ title, html, tags });
    console.log('Draft result:', out);
  } else if (cmd === 'publish') {
    const scheduleAt = process.argv[3];
    const out = await driver.publishPost({ id: 'demo_draft', scheduleAt });
    console.log('Publish result:', out);
  } else {
    console.log('Usage:');
    console.log('npm run demo:substack draft "Title" "<p>Body</p>"');
    console.log('npm run demo:substack publish [ISO_SCHEDULE]');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
