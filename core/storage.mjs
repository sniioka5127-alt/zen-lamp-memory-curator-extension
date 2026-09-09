import { deepClone } from "./types.mjs";

export function createMemoryAdapter(seed = {}) {
  const map = new Map(Object.entries(deepClone(seed)));
  return {
    async get(key) {
      return deepClone(map.get(key));
    },
    async set(key, value) {
      map.set(key, deepClone(value));
    },
    async remove(key) {
      map.delete(key);
    },
    async entries(prefix = "") {
      return [...map.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key, deepClone(value)]);
    }
  };
}

export function createChromeStorageAdapter(storageArea) {
  if (!storageArea?.get || !storageArea?.set || !storageArea?.remove) {
    throw new TypeError("A chrome.storage StorageArea-compatible object is required");
  }
  return {
    async get(key) {
      const result = await storageArea.get(key);
      return deepClone(result?.[key]);
    },
    async set(key, value) {
      await storageArea.set({ [key]: deepClone(value) });
    },
    async remove(key) {
      await storageArea.remove(key);
    },
    async entries(prefix = "") {
      const all = await storageArea.get(null);
      return Object.entries(all)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => [key, deepClone(value)]);
    }
  };
}

export function assertStorageAdapter(adapter) {
  for (const method of ["get", "set", "remove", "entries"]) {
    if (typeof adapter?.[method] !== "function") {
      throw new TypeError(`storage adapter missing ${method}()`);
    }
  }
  return adapter;
}
