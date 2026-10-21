#!/usr/bin/env node
// Creative Flo Style Lab: local server for a client's first-run style interview.
// Serves the lab and saves answers + logo into styles/clients/<slug>/ in this repo.
// Usage: npm run style-lab -- <client-slug> [--port 4747]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const args = process.argv.slice(2);
const slug = (args.find((a) => !a.startsWith("--")) || "").toLowerCase();
const port = Number((args[args.indexOf("--port") + 1] || "").match(/^\d+$/) ? args[args.indexOf("--port") + 1] : 4747);
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) {
  console.error("Give the client a slug: npm run style-lab -- acme-fitness");
  process.exit(1);
}
const dir = path.join(root, "styles", "clients", slug);
fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
const answersPath = path.join(dir, "style-answers.json");
const page = fs.readFileSync(path.join(here, "index.html"), "utf8");
const shell = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style></head><body>${page}</body></html>`;

function body(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(shell);
    }
    if (url.pathname === "/api/answers" && req.method === "GET") {
      if (!fs.existsSync(answersPath)) { res.writeHead(404); return res.end("{}"); }
      res.writeHead(200, { "Content-Type": "application/json" }); return res.end(fs.readFileSync(answersPath));
    }
    if (url.pathname === "/api/answers" && req.method === "POST") {
      const data = JSON.parse((await body(req, 512_000)).toString("utf8"));
      fs.writeFileSync(answersPath, JSON.stringify({ ...data, client: slug, savedAt: new Date().toISOString() }, null, 2));
      if (data?.answers?.done) console.log(`\n✓ ${slug} finished the Style Lab → ${path.relative(root, answersPath)}\n  Next: tell the agent "build the style for ${slug}" (style-interview skill).`);
      res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"ok":true}');
    }
    if (url.pathname === "/api/logo" && req.method === "POST") {
      const name = String(url.searchParams.get("name") || "logo.png");
      const ext = (path.extname(name).toLowerCase().match(/^\.(png|svg|jpe?g|webp)$/) || [".png"])[0];
      fs.writeFileSync(path.join(dir, "assets", `logo${ext}`), await body(req, 15_000_000));
      res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"ok":true}');
    }
    res.writeHead(404); res.end("not found");
  } catch (e) { res.writeHead(400); res.end(JSON.stringify({ error: String(e.message || e) })); }
}).listen(port, "127.0.0.1", () => {
  console.log(`Creative Flo Style Lab for "${slug}" → http://localhost:${port}/?client=${slug}`);
  const shown = answersPath.startsWith(root + path.sep) ? path.relative(root, answersPath) : answersPath;
console.log(`Answers save to ${shown}. Ctrl+C when the client is done.`);
});
