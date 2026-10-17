/**
 * User settings, doc 02 section 5. Persisted to localStorage where specified
 * (theme and display name); everything else is session-scoped. AI keys are
 * handled separately in T4.1.
 */

export type Theme = 'system' | 'light' | 'dark';

const read = (key: string): string | null => {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* private mode: keep in memory only */
  }
};

export const settings = $state({
  theme: ((): Theme => {
    const v = read('meshly:theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  })(),
  displayName: read('meshly:name') ?? '',
  micOn: true,
  camOn: true,
  relayOnly: false,
  showConnectionDetails: false,
  transportNostr: true,
  transportMqtt: true,
});

export function persistName(name: string): void {
  settings.displayName = name.trim();
  write('meshly:name', settings.displayName);
}

export function persistTheme(theme: Theme): void {
  settings.theme = theme;
  write('meshly:theme', theme);
}
