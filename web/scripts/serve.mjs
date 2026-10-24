// Tiny static server for the exported site. Usage: node scripts/serve.mjs [dir=out] [port=3000] [sharedDir]
// Requests under /shared/ fall back to sharedDir (default ../shared, i.e. app/shared) when not in dir.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "out");
const port = Number(process.argv[3] ?? 3000);
const shared = path.resolve(process.argv[4] ?? path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "shared"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".tlock": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function resolveFile(base, rel) {
  const p = path.join(base, rel);
  if (!p.startsWith(base)) return null;
  try {
    const s = await stat(p);
    if (s.isDirectory()) {
      const idx = path.join(p, "index.html");
      await stat(idx);
      return idx;
    }
    return p;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rel = decodeURIComponent(url.pathname);
    let file = await resolveFile(root, rel);
    if (!file && rel.startsWith("/shared/")) file = await resolveFile(shared, rel.slice("/shared/".length));
    if (!file) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end("error");
  }
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port} (shared: ${shared})`));
