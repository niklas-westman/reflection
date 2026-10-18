export type ColorScheme = 'light' | 'dark';

const STORAGE_KEY = 'reflection-ui:color-scheme';

/** The saved choice, else the system preference. Storage may be blocked, so every access is guarded. */
export function readColorScheme(): ColorScheme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // Storage is a convenience only.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyColorScheme(scheme: ColorScheme): void {
  document.documentElement.dataset.theme = scheme;
  try {
    window.localStorage.setItem(STORAGE_KEY, scheme);
  } catch {
    // Not saved; the choice still applies for this visit.
  }
}
