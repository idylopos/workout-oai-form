import type { PrivateWorkoutData } from "./workout-types";

const DATABASE_NAME = "workout-oai-private";
const STORE_NAME = "private-data";
const STATE_KEY = "current";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open private storage."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Private storage operation failed."));
    transaction.oncomplete = () => database.close();
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Private storage transaction was interrupted."));
    };
  });
}

export async function loadPrivateData(): Promise<PrivateWorkoutData | null> {
  const stored = await withStore<PrivateWorkoutData | undefined>("readonly", (store) =>
    store.get(STATE_KEY),
  );
  return stored ?? null;
}

export async function savePrivateData(data: PrivateWorkoutData): Promise<void> {
  await withStore<IDBValidKey>("readwrite", (store) => store.put(data, STATE_KEY));
}

export async function clearPrivateData(): Promise<void> {
  await withStore<undefined>("readwrite", (store) => store.delete(STATE_KEY));
}

export async function requestPersistentStorage(): Promise<"granted" | "best-effort" | "unavailable"> {
  if (!navigator.storage?.persist) return "unavailable";
  return (await navigator.storage.persist()) ? "granted" : "best-effort";
}

