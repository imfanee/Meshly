/**
 * Install UX state, doc 05 section 6. Decides which (if any) install affordance
 * to show: a real Chromium prompt, an iOS/macOS guide sheet, or nothing.
 */

export type InstallKind =
  | 'hidden'
  | 'prompt' // beforeinstallprompt captured (Chromium)
  | 'ios-safari' // iOS Safari: share-sheet guide
  | 'ios-other' // iOS non-Safari: must switch to Safari
  | 'mac-safari'; // macOS Safari 17+: File, Add to Dock

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;

const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const isIos =
  /iPad|iPhone|iPod/.test(ua) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
const isMacSafari =
  !isIos && isSafari && /Macintosh/.test(ua) && navigator.maxTouchPoints <= 1;

export const install = $state({
  standalone: false,
  kind: 'hidden' as InstallKind,
  sheetOpen: false,
});

function recompute(): void {
  if (install.standalone) {
    install.kind = 'hidden';
  } else if (deferred) {
    install.kind = 'prompt';
  } else if (isIos && isSafari) {
    install.kind = 'ios-safari';
  } else if (isIos) {
    install.kind = 'ios-other';
  } else if (isMacSafari) {
    install.kind = 'mac-safari';
  } else {
    install.kind = 'hidden';
  }
}

export function initInstall(): void {
  if (typeof window === 'undefined') return;
  const mq = window.matchMedia('(display-mode: standalone)');
  install.standalone =
    mq.matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  mq.addEventListener('change', () => {
    install.standalone = mq.matches;
    recompute();
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    recompute();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    install.standalone = true;
    recompute();
  });
  recompute();
}

/** Show the platform-appropriate install affordance. */
export async function requestInstall(): Promise<void> {
  if (install.kind === 'prompt' && deferred) {
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    recompute();
    return;
  }
  if (install.kind !== 'hidden') install.sheetOpen = true;
}
