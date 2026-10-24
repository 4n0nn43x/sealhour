// localStorage for per viewer conveniences (language, role, mode, cached beacon info). The demo stores no key.
// Exception, testnet only: the "sealhour.testnet." namespace (lib/live.ts) holds burner wallet keys, centre
// identities and r_c of the live test, with explicit warnings, an export and a "forget" button (solo test only).
export const storage = {
  get(key: string): string | null {
    try {
      return typeof window === "undefined" ? null : window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: ignore */
    }
  },
  remove(key: string): void {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(key);
    } catch {
      /* storage unavailable: ignore */
    }
  },
  /** Keys starting with prefix. */
  keys(prefix: string): string[] {
    try {
      return typeof window === "undefined" ? [] : Object.keys(window.localStorage).filter((k) => k.startsWith(prefix));
    } catch {
      return [];
    }
  },
};
