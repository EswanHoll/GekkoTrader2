/**
 * Copy dist/index.html to every greenfield desk/hub path so Cloudflare Pages
 * serves the React shell for directory URLs (not a stale prior deployment).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const indexHtml = path.join(dist, "index.html");

if (!fs.existsSync(indexHtml)) {
  console.error("spa-route-html: missing dist/index.html — run vite build first");
  process.exit(1);
}

const html = fs.readFileSync(indexHtml, "utf8");

const routes = [
  "overview",
  "overview/strategies",
  "overview/roadmaps",
  "status",
  "audit",
  "login",
  "account/password",
  "admin",
  "admin/users",
  "admin/keys",
  "admin/operator",
  "admin/audit",
  "live",
  "sim/a",
  "sim/a/results",
  "sim/a/runs",
  "sim/a/setup",
  "sim/a/compare",
  "sim/b",
  "sim/b/results",
  "sim/b/runs",
  "sim/b/setup",
  "sim/b/compare",
  "demo/a",
  "demo/a/results",
  "demo/a/runs",
  "demo/a/setup",
  "demo/b",
  "demo/b/results",
  "demo/b/runs",
  "demo/b/setup",
];

for (const route of routes) {
  const dir = path.join(dist, route);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

console.log(`spa-route-html: wrote ${routes.length} route index.html files`);
