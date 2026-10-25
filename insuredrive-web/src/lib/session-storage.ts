/** Tab-scoped tokens. Passwords never pass through this adapter. */
export const authStorageKey = (url: string) =>
  `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;

export function createSessionStorage(url: string) {
  const prefix = authStorageKey(url);
  const memory = new Map<string, string>();
  // Upgrade from v1.15: discard this project's old persistent browser session.
  // Never read or migrate its token; require a fresh staff sign-in.
  for (const suffix of ["", "-code-verifier", "-user"]) {
    try {
      window.localStorage.removeItem(prefix + suffix);
    } catch {
      /* blocked storage */
    }
  }
  return {
    getItem(key: string): string | null {
      try {
        return window.sessionStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
      try {
        window.sessionStorage.setItem(key, value);
      } catch {
        /* memory-only fallback */
      }
    },
    removeItem(key: string) {
      memory.delete(key);
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        /* memory-only fallback */
      }
    },
  };
}
