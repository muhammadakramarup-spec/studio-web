// src/app/persist.ts
//
// Wave 3 Function 2 (project v2 + local recovery). Local-only IndexedDB recovery: one database
// (`studio-web`), one object store (`recovery`), a single record keyed `"current"`. No network,
// no telemetry — every write and read here stays on the user's own machine.

import { parseProjectDocument, type ProjectDocumentV2 } from "../project/format.ts";

const DB_NAME = "studio-web";
const DB_VERSION = 1;
const STORE_NAME = "recovery";
const RECORD_KEY = "current";

export interface RecoveryRecord {
  savedAt: string;
  doc: ProjectDocumentV2;
}

export interface RecoveryStore {
  save(doc: ProjectDocumentV2): Promise<void>;
  load(): Promise<RecoveryRecord | null>;
  clear(): Promise<void>;
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open the recovery database"));
  });
}

/** Returns null (never throws) when IndexedDB is unavailable or fails to open. */
export async function openRecoveryStore(): Promise<RecoveryStore | null> {
  if (typeof indexedDB === "undefined") return null;

  let db: IDBDatabase;
  try {
    db = await openDatabase();
  } catch {
    return null;
  }

  return {
    async save(doc: ProjectDocumentV2): Promise<void> {
      const record: RecoveryRecord = { savedAt: new Date().toISOString(), doc };
      const tx = db.transaction(STORE_NAME, "readwrite");
      await promisifyRequest(tx.objectStore(STORE_NAME).put(record, RECORD_KEY));
    },

    async load(): Promise<RecoveryRecord | null> {
      let raw: unknown;
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        raw = await promisifyRequest(tx.objectStore(STORE_NAME).get(RECORD_KEY));
      } catch {
        return null;
      }
      if (!raw || typeof raw !== "object") return null;
      const candidate = raw as { savedAt?: unknown; doc?: unknown };
      if (typeof candidate.savedAt !== "string" || !candidate.doc) return null;
      try {
        // Route the stored doc back through parseProjectDocument so a corrupt or
        // format-drifted record is discarded rather than handed to the app unchecked.
        const doc = parseProjectDocument(JSON.stringify(candidate.doc));
        return { savedAt: candidate.savedAt, doc };
      } catch {
        return null;
      }
    },

    async clear(): Promise<void> {
      const tx = db.transaction(STORE_NAME, "readwrite");
      await promisifyRequest(tx.objectStore(STORE_NAME).delete(RECORD_KEY));
    },
  };
}

export interface AutosaverOptions {
  store: RecoveryStore;
  /**
   * Return the document to save, `null` when there is nothing to save (no model loaded), or the
   * literal string `"busy"` when the app cannot capture right now (e.g. an export is rendering).
   * `runSave` re-arms the debounce on `"busy"` instead of treating it as "nothing to save" — see
   * D-2, status/warden-log.md "defect D-2 opened".
   */
  capture: () => Promise<ProjectDocumentV2 | null | "busy">;
  debounceMs?: number;
  onStatus?: (message: string) => void;
}

export interface Autosaver {
  markDirty(): void;
  flush(): Promise<void>;
  dispose(): void;
}

/**
 * Debounced autosave: `markDirty()` (re)starts a `debounceMs` timer that captures and saves the
 * current document; `flush()` saves immediately. Also flushes on `visibilitychange` (hidden) and
 * `pagehide` so a closed tab or backgrounded app doesn't lose the debounce window. On
 * QuotaExceededError, reports once via `onStatus` and stops trying for the rest of this
 * autosaver's lifetime (rather than retrying every dirty edit against a full store).
 */
export function createAutosaver(options: AutosaverOptions): Autosaver {
  const { store, capture, onStatus } = options;
  const debounceMs = options.debounceMs ?? 2000;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let quotaExceeded = false;
  let disposed = false;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function armRetry(): void {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void runSave();
    }, debounceMs);
  }

  async function runSave(): Promise<void> {
    if (disposed || quotaExceeded) return;
    let doc: ProjectDocumentV2 | null | "busy";
    try {
      doc = await capture();
    } catch {
      return;
    }
    // Re-check after the async capture: dispose()/quotaExceeded may have changed while it was in
    // flight, and a "busy" result must not re-arm a timer past either of those.
    if (disposed || quotaExceeded) return;
    if (doc === "busy") {
      armRetry();
      return;
    }
    if (!doc) return;
    try {
      await store.save(doc);
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      if (name === "QuotaExceededError") {
        quotaExceeded = true;
        onStatus?.("Autosave unavailable (storage full)");
      }
    }
  }

  function markDirty(): void {
    if (disposed || quotaExceeded) return;
    armRetry();
  }

  async function flush(): Promise<void> {
    clearTimer();
    await runSave();
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "hidden") void flush();
  }
  function onPageHide(): void {
    void flush();
  }

  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);
  if (typeof window !== "undefined") window.addEventListener("pagehide", onPageHide);

  function dispose(): void {
    disposed = true;
    clearTimer();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", onPageHide);
  }

  return { markDirty, flush, dispose };
}
