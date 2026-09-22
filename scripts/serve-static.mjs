// Serve the static export in dist/client for a local production check.
// The Fly.io deployment uses nginx (deploy/nginx.conf); this mirrors its
// routing and MIME rules closely enough for smoke tests.
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../dist/client");
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".jdx": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

function send(res, file, status = 200) {
  const size = statSync(file).size;
  res.writeHead(status, {
    "Content-Type": types[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Content-Length": size,
    "X-Content-Type-Options": "nosniff",
  });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  const target = normalize(join(root, pathname));
  if (!target.startsWith(root) || pathname.startsWith("/.vite/")) {
    send(res, join(root, "404.html"), 404);
    return;
  }
  try {
    const stat = statSync(target);
    send(res, stat.isDirectory() ? join(target, "index.html") : target);
  } catch {
    send(res, join(root, "404.html"), 404);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`NMRView static export at http://127.0.0.1:${port}/ (from ${root})`);
});
