// ===========================================================
// server.js — the local execution bridge.
//
// A dependency-free Node.js server (core modules only) that:
//   1. Serves the sandbox's static files (replaces a plain
//      `python -m http.server` so one command gets you both
//      hosting AND the API below).
//   2. Persists ingested multi-language assets (.js/.html/.css/.py)
//      to disk under data/ingested/<category>/ so the Asset &
//      Script Manager survives a page reload.
//   3. Executes ingested Python scripts as real child processes
//      and streams back stdout/stderr — the piece a browser
//      sandbox cannot do on its own.
//
// This is a LOCAL developer tool: it is meant to be run on your
// own machine for your own dropped files, and executes Python
// exactly the way any local dev server / task runner would. It
// is not hardened for exposure to untrusted networks — bind
// stays on localhost by default.
// ===========================================================

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'ingested');
const CATEGORIES = { scripts: 'js', overlays: 'html', styles: 'css', python: 'py' };
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';

const MAX_ASSET_BYTES = 2 * 1024 * 1024; // 2MB per ingested file
const PY_TIMEOUT_MS = 8000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

for (const cat of Object.keys(CATEGORIES)) {
  fs.mkdirSync(path.join(DATA_DIR, cat), { recursive: true });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => sendJson(res, 500, { ok: false, error: err.message }));
});

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments[0] === 'api') return handleApi(req, res, url, segments.slice(1));
  return serveStatic(req, res, url.pathname);
}

// ---------------------------------------------------------------
// Static file serving (the whole project directory, same as
// `serve .` / `python -m http.server`).
// ---------------------------------------------------------------
async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const filePath = path.join(ROOT, rel);

  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

// ---------------------------------------------------------------
// JSON API: /api/assets (list/save/delete), /api/run-python
// ---------------------------------------------------------------
async function handleApi(req, res, url, segments) {
  if (segments[0] === 'assets') return handleAssets(req, res, segments.slice(1));
  if (segments[0] === 'run-python') return handleRunPython(req, res);
  return sendJson(res, 404, { ok: false, error: 'Unknown API route' });
}

async function handleAssets(req, res, segments) {
  if (req.method === 'GET' && segments.length === 0) {
    const out = {};
    for (const cat of Object.keys(CATEGORIES)) {
      const dir = path.join(DATA_DIR, cat);
      const files = (await fsp.readdir(dir).catch(() => [])).filter((f) => !f.startsWith('.')); // skip .gitkeep etc.
      out[cat] = await Promise.all(files.map(async (filename) => {
        const stat = await fsp.stat(path.join(dir, filename));
        return { filename, category: cat, size: stat.size, mtime: stat.mtimeMs };
      }));
    }
    return sendJson(res, 200, { ok: true, assets: out });
  }

  if (req.method === 'POST' && segments.length === 0) {
    const body = await readJsonBody(req);
    const { category, filename, content } = body || {};
    const safeName = sanitizeFilename(filename);
    if (!CATEGORIES[category] || !safeName) return sendJson(res, 400, { ok: false, error: 'Invalid category or filename' });
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_ASSET_BYTES) {
      return sendJson(res, 400, { ok: false, error: `Content missing or exceeds ${MAX_ASSET_BYTES} bytes` });
    }
    await fsp.writeFile(path.join(DATA_DIR, category, safeName), content, 'utf8');
    return sendJson(res, 200, { ok: true, category, filename: safeName });
  }

  if (req.method === 'GET' && segments.length === 2) {
    const [category, filename] = segments;
    const safeName = sanitizeFilename(filename);
    if (!CATEGORIES[category] || !safeName) return sendJson(res, 400, { ok: false, error: 'Invalid category or filename' });
    try {
      const content = await fsp.readFile(path.join(DATA_DIR, category, safeName), 'utf8');
      return sendJson(res, 200, { ok: true, category, filename: safeName, content });
    } catch {
      return sendJson(res, 404, { ok: false, error: 'Not found' });
    }
  }

  if (req.method === 'DELETE' && segments.length === 2) {
    const [category, filename] = segments;
    const safeName = sanitizeFilename(filename);
    if (!CATEGORIES[category] || !safeName) return sendJson(res, 400, { ok: false, error: 'Invalid category or filename' });
    await fsp.unlink(path.join(DATA_DIR, category, safeName)).catch(() => {});
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { ok: false, error: 'Unknown assets route' });
}

// ---------------------------------------------------------------
// Python execution: runs an already-ingested script (by filename)
// as a real child process, with a hard timeout.
// ---------------------------------------------------------------
async function handleRunPython(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' });
  const body = await readJsonBody(req);
  const safeName = sanitizeFilename(body?.filename);
  if (!safeName || !safeName.endsWith('.py')) return sendJson(res, 400, { ok: false, error: 'Provide an ingested .py filename' });
  const filePath = path.join(DATA_DIR, 'python', safeName);

  try {
    await fsp.access(filePath);
  } catch {
    return sendJson(res, 404, { ok: false, error: `"${safeName}" has not been ingested (drag it onto the drop zone first).` });
  }

  const result = await runPythonFile(filePath, Array.isArray(body?.args) ? body.args.map(String) : []);
  return sendJson(res, 200, { ok: true, ...result });
}

function runPythonFile(filePath, args) {
  return new Promise((resolve) => {
    const tryRun = (bin, onFail) => {
      const child = spawn(bin, [filePath, ...args], { cwd: path.dirname(filePath) });
      let stdout = '', stderr = '', settled = false;
      const timer = setTimeout(() => { child.kill('SIGKILL'); }, PY_TIMEOUT_MS);

      child.on('error', () => { clearTimeout(timer); if (!settled) { settled = true; onFail(); } });
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve({
          stdout,
          stderr: signal === 'SIGKILL' ? `${stderr}\n[killed: exceeded ${PY_TIMEOUT_MS}ms timeout]` : stderr,
          code,
        });
      });
    };

    tryRun('python3', () => tryRun('python', () => resolve({
      stdout: '', stderr: 'No Python interpreter found (tried "python3" and "python" on PATH).', code: -1,
    })));
  });
}

// ---------------------------------------------------------------
// helpers
// ---------------------------------------------------------------
function sanitizeFilename(name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  const base = path.basename(name.trim());
  if (base !== name.trim() || base.startsWith('.') || base.includes('..')) return null;
  return base;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_ASSET_BYTES + 4096) { req.destroy(); reject(new Error('Request body too large')); return; }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (err) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

server.listen(PORT, HOST, () => {
  console.log(`Platformer Sandbox bridge running at http://${HOST}:${PORT}`);
  console.log(`Serving static files from ${ROOT}`);
  console.log(`Ingested assets persisted under ${DATA_DIR}`);
});
