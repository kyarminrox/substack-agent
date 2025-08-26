import { openContext, newPage, saveAuthState } from '../infra/playwright.js';
import { env } from '../infra/config.js';

async function main() {
  const { browser, context } = await openContext();
  const page = await newPage(context);
  await page.goto(`${env.SUBSTACK_BASE_URL}/signin`);
  console.log(`Opened ${env.SUBSTACK_BASE_URL}/signin - complete login in the browser and press Enter here when done.`);
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });
  await saveAuthState(context);
  await browser.close();
  console.log('Saved auth state to', `${env.SUBSTACK_AUTH_DIR}/substack.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
