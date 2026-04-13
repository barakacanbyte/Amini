/**
 * Coinbase / wallet SDKs reference `localStorage` during SSR where it does not exist.
 * No-op storage on the server avoids ReferenceError; the real API exists in the browser.
 */
const noopStorage: Storage = {
  getItem() {
    return null;
  },
  setItem() {},
  removeItem() {},
  clear() {},
  get length() {
    return 0;
  },
  key() {
    return null;
  },
};

if (typeof window === "undefined" && typeof globalThis !== "undefined") {
  try {
    if (!("localStorage" in globalThis) || globalThis.localStorage === undefined) {
      Object.defineProperty(globalThis, "localStorage", {
        value: noopStorage,
        configurable: true,
        enumerable: true,
        writable: true,
      });
    }
  } catch {
    /* ignore */
  }
}

export {};
