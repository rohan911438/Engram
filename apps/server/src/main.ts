import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { config } from "dotenv";
import { servicesFromEnv } from "@engram/sdk";
import { createApp } from "./app.js";
import { Tenant, Tenants } from "./tenants.js";

const root = resolve(import.meta.dirname, "../../..");
config({ path: process.env.ENGRAM_ENV ?? join(root, ".env"), quiet: true });

const s = servicesFromEnv();
const services = { remote: s.remote, anchorer: s.anchorer, tatum: s.tatum, llm: () => s.llm(), remoteFor: s.remoteFor };
const dataDir = resolve(process.env.ENGRAM_DATA ?? join(root, "data"));
const demoDir = resolve(process.env.ENGRAM_DEMO_DIR ?? join(root, "demo", "money-ops"));
const staticDir = [process.env.ENGRAM_WEB_DIST, join(root, "apps", "web", "dist")].find((d) => d && existsSync(join(d, "index.html"))) ?? null;

const demo = existsSync(join(demoDir, ".engram", "config.json")) ? new Tenant("demo", demoDir, services, true) : null;
const app = createApp({ tenants: new Tenants(dataDir, services), demo, tatum: s.tatum, staticDir, secureCookies: process.env.NODE_ENV === "production", trustProxy: process.env.TRUST_PROXY === "1", walrusUrl: process.env.MEMWAL_SERVER_URL, llmConfigured: !!(process.env.GEMINI_API_KEYS ?? process.env.GEMINI_API_KEY) });

const port = Number(process.env.PORT ?? 8787);
app.listen(port, process.env.HOST ?? "127.0.0.1", () => {
  console.log(`Engram server on http://localhost:${port}`);
  console.log(`  data      ${dataDir}`);
  console.log(`  demo      ${demo ? demoDir : "(none)"}`);
  console.log(`  web app   ${staticDir ?? "(not built — API only)"}`);
  if (s.anchorWarning) console.log(`  ! ${s.anchorWarning}`);
});
