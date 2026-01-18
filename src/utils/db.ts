import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface Stroke {
  id: string;
  turnNumber: number;
  timestamp: number;
  color: string;
  brushSize: number;
  points: Array<{ x: number; y: number; timestamp: number }>;
}

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
  strokes: {
    key: string;
    value: Stroke;
    indexes: { 'by-turn': number; 'by-timestamp': number };
  };
}

const DB_NAME = 'turn-based-canvas';
const DB_VERSION = 2;

let dbInstance: IDBPDatabase<CanvasDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<CanvasDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<CanvasDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      console.log(`Database upgrade from version ${oldVersion} to ${DB_VERSION}`);
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

      // Strokes store (for timelapse) - create if upgrading from version 1 or doesn't exist
      if (oldVersion < 2 || !db.objectStoreNames.contains('strokes')) {
        console.log('Creating strokes store');
        const strokesStore = db.createObjectStore('strokes', {
          keyPath: 'id',
        });
        strokesStore.createIndex('by-turn', 'turnNumber');
        strokesStore.createIndex('by-timestamp', 'timestamp');
        console.log('Strokes store created');
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
  await db.clear('strokes');
}

// Stroke recording functions
export async function saveStroke(stroke: Stroke): Promise<void> {
  try {
    const db = await getDB();
    console.log('Saving stroke to DB:', stroke.id, 'turn:', stroke.turnNumber, 'points:', stroke.points.length);
    await db.put('strokes', stroke);
    console.log('Stroke saved to DB successfully');
  } catch (error) {
    console.error('Error saving stroke to DB:', error);
    throw error;
  }
}

export async function getStrokesForTurn(turnNumber: number): Promise<Stroke[]> {
  try {
    const db = await getDB();
    const index = db.transaction('strokes', 'readonly').store.index('by-turn');
    const strokes = await index.getAll(turnNumber);
    console.log(`getStrokesForTurn(${turnNumber}): found ${strokes.length} strokes`);
    return strokes.sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    console.error('Error getting strokes for turn:', error);
    return [];
  }
}

export async function getAllStrokes(): Promise<Stroke[]> {
  const db = await getDB();
  const strokes = await db.getAll('strokes');
  return strokes.sort((a, b) => {
    if (a.turnNumber !== b.turnNumber) {
      return a.turnNumber - b.turnNumber;
    }
    return a.timestamp - b.timestamp;
  });
}

export async function clearStrokesForTurn(turnNumber: number): Promise<void> {
  const db = await getDB();
  const index = db.transaction('strokes', 'readwrite').store.index('by-turn');
  const strokes = await index.getAll(turnNumber);
  for (const stroke of strokes) {
    await db.delete('strokes', stroke.id);
  }
}
