/**
 * Serves the web app's build like the Render static site: an existing file
 * wins, `/r/*` goes to the API and every other path falls back to index.html
 * (the rewrites in render.yaml), with the same caching and security headers.
 * Keep the two in step.
 */
import { readFile, stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../apps/web/build/client/", import.meta.url));
const port = Number(process.env["PORT"] ?? 3100);
const apiUrl = process.env["API_URL"] ?? "http://127.0.0.1:3101";

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

const securityHeaders = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
};

async function resolve(pathname: string): Promise<string> {
  const candidate = join(root, normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, ""));
  if (!candidate.startsWith(root)) return join(root, "index.html");
  try {
    if ((await stat(candidate)).isFile()) return candidate;
  } catch {
    // Not a file: fall through to the app shell.
  }
  return join(root, "index.html");
}

/** Answer with the API's response, as Render's rewrite to a full URL should. */
async function proxyToApi(url: string, response: ServerResponse): Promise<void> {
  const upstream = await fetch(apiUrl + url);
  const headers = Object.fromEntries(upstream.headers);
  // fetch has already decompressed the body.
  delete headers["content-encoding"];
  delete headers["content-length"];
  response.writeHead(upstream.status, headers);
  response.end(await upstream.text());
}

createServer((request, response) => {
  const { pathname, search } = new URL(request.url ?? "/", "http://localhost");
  if (pathname.startsWith("/r/")) {
    proxyToApi(pathname + search, response).catch((error: unknown) => {
      console.error("Rewrite to the API failed", error);
      response.writeHead(502).end();
    });
    return;
  }
  resolve(pathname)
    .then(async (file) => {
      const body = await readFile(file);
      response.writeHead(200, {
        "content-type": types[extname(file)] ?? "application/octet-stream",
        "cache-control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        ...securityHeaders,
      });
      response.end(body);
    })
    .catch((error: unknown) => {
      console.error("Static server failed", error);
      response.writeHead(500).end();
    });
}).listen(port, "127.0.0.1", () => {
  console.log("Serving the web app on " + String(port));
});
