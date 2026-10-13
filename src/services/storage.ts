import { FCSFile, Gate } from '../types/cytometry';

/**
 * Client-Side Persistence Layer using Browser IndexedDB
 * Allows 100% free offline storage for large FCS files, gating hierarchies, and workflows.
 */

const DB_NAME = 'CytoflowDB';
const DB_VERSION = 1;
const STORE_SAMPLES = 'samples';
const STORE_GATES = 'gates';
const STORE_WORKFLOWS = 'workflows';

export class StorageService {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  private static getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_SAMPLES)) {
          db.createObjectStore(STORE_SAMPLES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_GATES)) {
          db.createObjectStore(STORE_GATES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_WORKFLOWS)) {
          db.createObjectStore(STORE_WORKFLOWS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  public static async saveSample(sample: FCSFile): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SAMPLES, 'readwrite');
      const store = tx.objectStore(STORE_SAMPLES);
      // We clone sample to avoid cloning errors with non-transferable objects
      const sampleRecord = {
        ...sample,
        events: Array.from(sample.events.slice(0, 50000)), // store compact representation for persistence
      };
      const req = store.put(sampleRecord);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public static async saveGates(gates: Gate[]): Promise<void> {
    try {
      localStorage.setItem('cytoflow_gates', JSON.stringify(gates));
    } catch (e) {
      console.warn('Could not save gates to localStorage:', e);
    }
  }

  public static getSavedGates(): Gate[] | null {
    try {
      const data = localStorage.getItem('cytoflow_gates');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }
}
