export type StoredMedia = {
  name: string;
  kind: 'image' | 'video';
  blob: Blob;
};

const DB_NAME = 'parapost-creatorverse-local-media';
const STORE = 'post-attachments';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    let blocked = false;

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };

    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Database blocked')); };
  });
}

export async function saveLocalMedia(
  key: string,
  files: StoredMedia[]
): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(files, key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function loadLocalMedia(
  key: string
): Promise<StoredMedia[]> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);

    let result: StoredMedia[] = [];
    request.onsuccess = () => {
      const stored: unknown = request.result;
      if (stored !== undefined && (!Array.isArray(stored) || stored.some((value: unknown) => {
        if (!value || typeof value !== 'object') return true;
        const item = value as Partial<StoredMedia>;
        return typeof item.name !== 'string' || !['image', 'video'].includes(item.kind ?? '') || !(item.blob instanceof Blob);
      }))) {
        tx.abort();
        return;
      }
      result = (stored as StoredMedia[] | undefined) ?? [];
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    const fail = () => { db.close(); reject(tx.error ?? new Error('Media read aborted')); };
    request.onerror = fail;
    tx.onerror = fail;
    tx.onabort = fail;
  });
}

export async function deleteLocalMedia(
  key: string
): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
