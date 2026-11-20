import { useCallback, useEffect, useRef, useState } from "react";

const READ_TIMEOUT_MS = 8_000;
const NORMAL_SPACING_MS = 15_000;
const MAX_BACKOFF_MS = 180_000;

/** Best-effort UI data. One read at a time, and background failures back off
 * without disrupting a user editing or saving a canvas. */
export function useBackgroundRead<T>(
  key: string | null,
  read: (signal: AbortSignal) => Promise<T>,
  onResult: (result: T) => void,
  onFailure?: () => void,
  intervalMs?: number,
) {
  const handlers = useRef({ read, onResult, onFailure });
  handlers.current = { read, onResult, onFailure };
  const trigger = useRef<(manual?: boolean) => Promise<void>>(async () => undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!key) { setLoading(false); return; }
    let alive = true;
    let nextAt = 0, failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running: Promise<void> | undefined;
    let active: AbortController | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (alive && intervalMs && navigator.onLine && document.visibilityState !== "hidden") {
        timer = setTimeout(() => void run(), Math.max(1, nextAt - Date.now()));
      }
    };
    const run = (manual = false): Promise<void> => {
      if (!alive || !navigator.onLine || document.visibilityState === "hidden") return Promise.resolve();
      if (running) return running;
      if (!manual && Date.now() < nextAt) { schedule(); return Promise.resolve(); }
      clearTimeout(timer);
      const controller = new AbortController();
      active = controller;
      setLoading(true);
      let deadline: ReturnType<typeof setTimeout>;
      const aborted = new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("Background read stopped.")), { once: true });
        deadline = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
      });
      running = Promise.race([
        Promise.resolve().then(() => {
          if (!alive || controller.signal.aborted) throw new Error("Background read stopped.");
          return handlers.current.read(controller.signal);
        }), aborted,
      ]).then(result => {
        if (!alive) return;
        failures = 0;
        nextAt = Date.now() + (intervalMs ?? NORMAL_SPACING_MS);
        handlers.current.onResult(result);
      }, () => {
        if (!alive) return;
        failures++;
        nextAt = Date.now() + Math.min(MAX_BACKOFF_MS, 30_000 * 2 ** failures);
        handlers.current.onFailure?.();
      }).finally(() => {
        clearTimeout(deadline);
        running = undefined;
        active = undefined;
        if (!alive) return;
        setLoading(false);
        schedule();
      });
      return running;
    };

    const wake = () => void run();
    const online = () => void run(true);
    trigger.current = run;
    void run();
    window.addEventListener("focus", wake);
    window.addEventListener("online", online);
    window.addEventListener("mindcanvas:activity-updated", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      active?.abort();
      clearTimeout(timer);
      trigger.current = async () => undefined;
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", online);
      window.removeEventListener("mindcanvas:activity-updated", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [key, intervalMs]);

  return { loading, refresh: useCallback((manual = false) => trigger.current(manual), []) };
}
