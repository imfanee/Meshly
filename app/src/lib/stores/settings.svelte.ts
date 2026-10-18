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

export type AiProvider = 'local' | 'groq' | 'gemini' | 'openai-compat';

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
  // ---- AI notes (doc 06 s.6): local models by default, BYOK upgrade -------
  aiProvider: 'local' as AiProvider,
  /** Session-scoped unless the user ticks "remember on this device". */
  aiKey: '',
  aiBaseUrl: '',
  aiModel: '',
  aiTranscribeModel: '',
  rememberAiKey: false,
});

export function persistName(name: string): void {
  settings.displayName = name.trim();
  write('meshly:name', settings.displayName);
}

export function persistTheme(theme: Theme): void {
  settings.theme = theme;
  write('meshly:theme', theme);
}

// ---- AI key persistence: only when the user ticks remember (doc 07) ------

const AI_KEYS = [
  'aiProvider',
  'aiKey',
  'aiBaseUrl',
  'aiModel',
  'aiTranscribeModel',
] as const;

try {
  const saved = read('meshly:ai');
  if (saved) {
    const o = JSON.parse(saved) as Record<string, string>;
    for (const k of AI_KEYS) {
      if (typeof o[k] === 'string')
        (settings as Record<string, unknown>)[k] = o[k];
    }
    settings.rememberAiKey = true;
  }
} catch {
  /* corrupt entry: ignore */
}

export function persistAi(): void {
  if (settings.rememberAiKey) {
    const o: Record<string, string> = {};
    for (const k of AI_KEYS) o[k] = settings[k] as string;
    write('meshly:ai', JSON.stringify(o));
  } else {
    try {
      globalThis.localStorage?.removeItem('meshly:ai');
    } catch {
      /* private mode */
    }
  }
}
