import { readRuns } from '../infra/runs.js';
import { SubstackDriver } from '../drivers/substack.driver.js';

if (process.argv[2] === 'publish') {
  const args = process.argv.slice(3);
  let target: string | undefined;     // postId or editUrl
  let scheduleAt: string | undefined;  // ISO string
  let sendEmail = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--schedule') { scheduleAt = args[i + 1]; i++; }
    else if (args[i] === '--email') { sendEmail = true; }
    else if (!target) { target = args[i]; }
  }

  const driver = new SubstackDriver();

  if (!target) {
    const items = readRuns('substack-drafts', 100);
    const last = items.filter(x => (x as any).editUrl || (x as any).id).slice(-1)[0];
    if (!last) {
      console.error('No drafts found. Create one first.');
      process.exit(2);
    }
    target = (last as any).editUrl || (last as any).postId;
    console.log('Using last draft:', target);
  }

  const res = await driver.publishPost({
    postId: target,
    editUrl: target,
    scheduleAt,
    sendEmail,
  });
  console.log('Public URL:', res.publicUrl);
  process.exit(0);
}

async function main() {
  if (process.argv[2] === 'agent:write') {
    const args = process.argv.slice(3);
    let model: string | undefined;
    let updateLast = false;
    let overrideTitle: string | undefined;
    const topicParts: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--model') {
        model = args[i + 1];
        i++;
      } else if (args[i] === '--update-last') {
        updateLast = true;
      } else if (args[i] === '--title') {
        overrideTitle = args[i + 1];
        i++;
      } else {
        topicParts.push(args[i]);
      }
    }
    const topic = topicParts.join(' ');
    if (!topic) {
      console.error('Usage: agent:write "<topic or prompt>" [--model <provider>]');
      process.exit(2);
    }
    const { generateDraft } = await import('../brains/writer.js');

    const draft = await generateDraft({ topic, model, updateLast, overrideTitle });
    if (updateLast) {
      console.log('Updated draft at:', draft.editUrl);
    } else {
      const { SubstackDriver } = await import('../drivers/substack.driver.js');
      const driver = new SubstackDriver();
      const res = await driver.createDraft({ title: draft.title, html: draft.html, tags: [] });
      console.log('AI draft created:', res.id, res.editUrl);
    }
    process.exit(0);
  }

  if (process.argv[2] === 'agent:update') {
    const args = process.argv.slice(3);
    let model: string | undefined;
    let overrideTitle: string | undefined;
    let mode: 'dup' | 'inplace' = 'dup';
    let forceInplace = false;
    const topicParts: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--model') { model = args[i + 1]; i++; }
      else if (args[i] === '--title') { overrideTitle = args[i + 1]; i++; }
      else if (args[i] === '--mode') {
        const m = (args[i + 1] || '').toLowerCase();
        if (m === 'dup' || m === 'inplace') mode = m as any;
        i++;
      } else if (args[i] === '--force-inplace') {
        forceInplace = true;
      }
      else { topicParts.push(args[i]); }
    }
    const topic = topicParts.join(' ');
    if (!topic) {
      console.error('Usage: agent:update "<topic or prompt>" [--model <id>] [--title "new title"] [--mode dup|inplace]');
      process.exit(2);
    }
    const { generateDraft } = await import('../brains/writer.js');
    const out = await generateDraft({ topic, model, overrideTitle });
    if (mode === 'inplace') {
      const { SubstackDriver } = await import('../drivers/substack.driver.js');
      const driver = new SubstackDriver();
      const res = await driver.updateLastDraftHtml({ html: out.html, title: out.title, force: forceInplace });
      console.log('Updated draft at:', res.editUrl);
    } else {
      const { SubstackDriver } = await import('../drivers/substack.driver.js');
      const driver = new SubstackDriver();
      // Duplicate path: create a new draft with rendered HTML
      const dup = await driver.createDraft({ title: out.title, html: out.html });
      console.log('New draft created at:', dup.editUrl ?? '(no url)');
    }
    process.exit(0);
  }

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
  } else {
    console.log('Usage:');
    console.log('  npm run demo:substack:draft -- <title> <html>');
    console.log('  npm run demo:substack:publish -- [postId] [--email] [--schedule "ISO"]');
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

