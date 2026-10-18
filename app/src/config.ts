/**
 * Meshly public runtime configuration.
 *
 * Every value here ships inside the client bundle, so this module must never
 * contain secrets. Values come from Vite env files (see ../.env.example at the
 * repo root); sensible fallbacks keep the app bootable for local development.
 */

const csv = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  /** Public URL of the deployed app, used for share links and OG metadata. */
  appUrl: import.meta.env.VITE_APP_URL ?? 'https://meshly.example.com',

  /** Same-origin path that mints TURN credentials. */
  turnCredentialsPath:
    import.meta.env.VITE_TURN_CREDENTIALS_PATH ?? '/api/turn.php',

  /** Free public STUN servers, always tried first (doc 04, staged ICE). */
  stunUrls: csv(import.meta.env.VITE_STUN_URLS),

  /** Own STUN endpoint on the coturn box, once it exists. */
  ownStunUrl: import.meta.env.VITE_OWN_STUN_URL || null,

  /** Nostr signalling relays (spike T0.3 keeps this list honest). */
  nostrRelays: csv(import.meta.env.VITE_NOSTR_RELAYS),

  /** MQTT over WebSocket signalling brokers (spike T0.4). */
  mqttBrokers: csv(import.meta.env.VITE_MQTT_BROKERS),

  /** Local dev relay used by e2e tests only; never set in production. */
  // Dev-only transport: Vite merges app/.env into production builds, so the
  // URL must be gated. Dev servers get it; e2e preview builds opt in with
  // VITE_E2E=1; production builds never set VITE_E2E so it compiles out.
  devRelayUrl:
    import.meta.env.DEV || import.meta.env.VITE_E2E === '1'
      ? import.meta.env.VITE_DEV_RELAY_URL || null
      : null,

  maxParticipants: int(import.meta.env.VITE_MAX_PARTICIPANTS, 12),
  maxVideo: int(import.meta.env.VITE_MAX_VIDEO, 6),

  /** Escalate a STUN-only pair to TURN after this many ms without connection. */
  iceEscalateMs: int(import.meta.env.VITE_ICE_ESCALATE_MS, 8000),

  version: __APP_VERSION__,
  buildTime: __BUILD_TIME__,
} as const;

export type AppConfig = typeof config;
