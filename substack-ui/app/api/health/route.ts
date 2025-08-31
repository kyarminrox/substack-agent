import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const root = process.cwd();
  const checks: Record<string, any> = {};

  const authDir = process.env.SUBSTACK_AUTH_DIR || path.resolve(root, "../playwright/.auth");
  checks.env = {
    GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL || "(default)",
    SUBSTACK_PUBLICATION_URL: process.env.SUBSTACK_PUBLICATION_URL || "",
    SUBSTACK_AUTH_DIR: authDir,
  };

  checks.authDirExists = fs.existsSync(authDir);

  // Verify agent package can be resolved via workspace
  let agentOk = false;
  try {
    await import("substack-agent/brains/writer");
    await import("substack-agent/drivers/substack.driver");
    agentOk = true;
  } catch {}
  checks.agentPackage = agentOk;

  return new Response(JSON.stringify({ ok: true, checks }, null, 2), {
    headers: { "content-type": "application/json" },
  });
}
