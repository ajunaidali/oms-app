const marks = new Map();

export function perfMarkStart(label) {
  const started = globalThis.performance?.now?.() ?? Date.now();
  marks.set(label, started);
}

export function perfMarkEnd(label) {
  const started = marks.get(label);
  if (started == null) return null;
  marks.delete(label);
  const ended = globalThis.performance?.now?.() ?? Date.now();
  const ms = Math.round(ended - started);
  // Visible in Metro and `adb logcat *:S ReactNativeJS:V`.
  console.log(`[OMS perf] ${label}: ${ms}ms`);
  return ms;
}