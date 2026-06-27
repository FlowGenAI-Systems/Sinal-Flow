// Servidor de produção do front do Sinal.
// Serve os arquivos estáticos de dist/public e encaminha /api para a API.
// Usa apenas módulos nativos do Node (sem dependências extras).
import http from "node:http";
import https from "node:https";
import { createReadStream, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "dist", "public");
const PORT = Number(process.env.PORT || 8080);
const API_TARGET = process.env.API_PROXY_TARGET || "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const url = req.url || "/";

  // 1) Proxy de /api -> API_TARGET (preserva método, headers e corpo)
  if (url.startsWith("/api")) {
    if (!API_TARGET) {
      res.writeHead(502).end("API_PROXY_TARGET nao configurado");
      return;
    }
    const t = new URL(API_TARGET);
    const isHttps = t.protocol === "https:";
    const client = isHttps ? https : http;
    const proxyReq = client.request(
      {
        protocol: t.protocol,
        hostname: t.hostname,
        port: t.port || (isHttps ? 443 : 80),
        path: url,
        method: req.method,
        headers: { ...req.headers, host: t.host },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", (e) => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
      res.end("proxy error: " + e.message);
    });
    req.pipe(proxyReq);
    return;
  }

  // 2) Arquivos estáticos com fallback de SPA para index.html
  let p = normalize(decodeURIComponent(url.split("?")[0]));
  if (p === "/" || p === "" || p === ".") p = "/index.html";
  // impede path traversal
  if (p.includes("..")) p = "/index.html";
  let file = join(DIST, p);
  try {
    if (!statSync(file).isFile()) throw new Error("not a file");
  } catch {
    file = join(DIST, "index.html");
  }
  res.writeHead(200, {
    "content-type": MIME[extname(file).toLowerCase()] || "application/octet-stream",
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[sinal-web] servindo ${DIST} na porta ${PORT}`);
  console.log(`[sinal-web] /api -> ${API_TARGET || "(nao configurado)"}`);
});
