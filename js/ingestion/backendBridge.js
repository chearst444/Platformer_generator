// ===========================================================
// BackendBridge — thin fetch wrapper around the local server's
// /api/* routes (server/server.js). Every call degrades
// gracefully: if the page is opened via a plain static server
// (or file://) the bridge simply reports itself unavailable and
// callers fall back to in-memory-only behaviour.
// ===========================================================

class BackendBridge {
  constructor() {
    this.available = null; // null = not probed yet, true/false after first attempt
  }

  async probe() {
    if (this.available !== null) return this.available;
    try {
      const res = await fetch('/api/assets', { method: 'GET' });
      this.available = res.ok;
    } catch {
      this.available = false;
    }
    return this.available;
  }

  async listAssets() {
    try {
      const res = await fetch('/api/assets');
      if (!res.ok) return null;
      const data = await res.json();
      this.available = true;
      return data.assets;
    } catch {
      this.available = false;
      return null;
    }
  }

  async saveAsset(category, filename, content) {
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, filename, content }),
      });
      this.available = res.ok || this.available;
      if (!res.ok) return { ok: false, error: (await res.json().catch(() => ({}))).error || res.statusText };
      return res.json();
    } catch {
      this.available = false;
      return { ok: false, error: 'Bridge server unavailable' };
    }
  }

  async deleteAsset(category, filename) {
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async runPython(filename, args = []) {
    try {
      const res = await fetch('/api/run-python', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, args }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return { ok: false, stdout: '', stderr: data.error || `HTTP ${res.status}`, code: -1 };
      return data;
    } catch {
      return { ok: false, stdout: '', stderr: 'Bridge server unavailable — run `npm start` to enable Python execution.', code: -1 };
    }
  }
}

export const backendBridge = new BackendBridge();
