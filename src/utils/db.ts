import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface CanvasDB extends DBSchema {
  canvas: {
    key: string;
    value: {
      baseImage: Blob;
      turnNumber: number;
    };
  };
  history: {
    key: number;
    value: {
      turnNumber: number;
      timestamp: number;
      pngBlob: Blob;
    };
    indexes: { 'by-turn': number };
  };
}

const DB_NAME = 'turn-based-canvas';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<CanvasDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<CanvasDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<CanvasDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Canvas store (single record with key 'current')
      if (!db.objectStoreNames.contains('canvas')) {
        db.createObjectStore('canvas');
      }

      // History store
      if (!db.objectStoreNames.contains('history')) {
        const historyStore = db.createObjectStore('history', {
          keyPath: 'turnNumber',
          autoIncrement: false,
        });
        historyStore.createIndex('by-turn', 'turnNumber');
      }
    },
  });

  return dbInstance;
}

export async function loadCanvas(): Promise<{
  baseImage: Blob | null;
  turnNumber: number;
}> {
  const db = await getDB();
  const data = await db.get('canvas', 'current');
  if (data) {
    return {
      baseImage: data.baseImage,
      turnNumber: data.turnNumber,
    };
  }
  return { baseImage: null, turnNumber: 0 };
}

export async function saveCanvas(baseImage: Blob, turnNumber: number): Promise<void> {
  const db = await getDB();
  await db.put('canvas', { baseImage, turnNumber }, 'current');
}

export async function saveHistory(
  turnNumber: number,
  timestamp: number,
  pngBlob: Blob
): Promise<void> {
  const db = await getDB();
  await db.put('history', { turnNumber, timestamp, pngBlob });
}

export async function getHistoryLength(): Promise<number> {
  const db = await getDB();
  return db.count('history');
}

export async function clearAll(): Promise<void> {
  const db = await getDB();
  await db.clear('canvas');
  await db.clear('history');
}
