import { SubstackDriver } from '../drivers/substack.driver.js';

async function main() {
  const cmd = process.argv[2];
  const driver = new SubstackDriver();

  if (cmd === 'draft') {
    const title = process.argv[3];
    const html = process.argv[4];
    if (!title || !html) {
      console.log('Usage: npm run demo:substack:draft -- <title> <html>');
      return;
    }
    await driver.ensureAuth();
    const out = await driver.createDraft({ title, html });
    console.log('Draft created:', out.id);
    if (out.editUrl) {
      console.log('Edit URL:', out.editUrl);
    }
  } else if (cmd === 'publish') {
    const id = process.argv[3];
    if (!id) {
      console.log('Usage: npm run demo:substack:publish -- <id>');
      return;
    }
    await driver.ensureAuth();
    const out = await driver.publishPost({ id });
    console.log('Post published:', out.publicUrl);
  } else {
    console.log('Usage:');
    console.log('  npm run demo:substack:draft -- <title> <html>');
    console.log('  npm run demo:substack:publish -- <id>');
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

