// ===========================================================
// consoleLogBuffer — listens for everything console-worthy
// (plugin/script errors, Python run results, generic log
// events, and a global window error/rejection net) from the
// moment it's imported — which main.js does before ingestion or
// scene loading runs. That matters because a broken persisted
// .js plugin can throw while being replayed at boot, well before
// the DevConsole panel (and its log view) exists; without this,
// that error would be silently dropped. Anything emitted before
// DevConsole attaches is buffered and replayed to it once it does.
// ===========================================================

import { bus } from '../state/eventBus.js';

const buffer = [];
let sink = null;

function emit(kind, text) {
  if (sink) sink(kind, text);
  else buffer.push({ kind, text });
}

bus.on('console:log', ({ kind, text }) => emit(kind || 'info', text));
bus.on('plugin:error', ({ source, error }) => emit('err', `[${source}] ${error.message || error}`));
bus.on('python:result', ({ filename, ok, stdout, stderr, code, sceneId }) => {
  emit(ok ? 'ok' : 'err', `python ${filename} exited ${code}`);
  if (stdout?.trim()) stdout.trim().split('\n').forEach((l) => emit('info', `  ${l}`));
  if (stderr?.trim()) stderr.trim().split('\n').forEach((l) => emit('err', `  ${l}`));
  if (sceneId) emit('ok', `  loaded stdout as new scene "${sceneId}"`);
});

// Global safety net: catches runtime errors from a dropped script's async
// code (setTimeout/promise callbacks) that its own synchronous try/catch
// (in IngestionManager) can't see, so a broken plugin never crashes the
// live preview silently.
window.addEventListener('error', (e) => {
  emit('err', `Uncaught error: ${e.message} (${e.filename?.split('/').pop() || 'unknown'}:${e.lineno})`);
});
window.addEventListener('unhandledrejection', (e) => {
  emit('err', `Unhandled promise rejection: ${e.reason?.message || e.reason}`);
});

/** DevConsole calls this once on construction: replays anything buffered, then becomes the live sink. */
export function attachLogSink(fn) {
  sink = fn;
  buffer.forEach(({ kind, text }) => fn(kind, text));
  buffer.length = 0;
}
