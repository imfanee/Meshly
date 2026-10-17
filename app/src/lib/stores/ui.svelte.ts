/**
 * UI store, doc 02 section 5: toasts, panels, layout, install and update UX.
 */

export interface Toast {
  id: number;
  text: string;
  /** 'persist' toasts (knocks) stay until dismissed or handled. */
  kind: 'info' | 'persist';
  createdAt: number;
}

export type SidePanel = 'chat' | 'people' | 'notes' | null;
export type StageLayout = 'grid' | 'speaker';

let nextToastId = 1;

export const ui = $state({
  toasts: [] as Toast[],
  panel: null as SidePanel,
  layout: 'grid' as StageLayout,
  moreOpen: false,
  settingsOpen: false,
  updateReady: false,
  /** Callback registered by the PWA update module. */
  applyUpdate: null as null | (() => void),
  unreadChat: 0,
  knockCount: 0,
});

export function toast(text: string, kind: Toast['kind'] = 'info'): number {
  const id = nextToastId++;
  ui.toasts.push({ id, text, kind, createdAt: Date.now() });
  if (kind === 'info') {
    setTimeout(() => dismissToast(id), 3_000);
  }
  return id;
}

export function dismissToast(id: number): void {
  const i = ui.toasts.findIndex((x) => x.id === id);
  if (i >= 0) ui.toasts.splice(i, 1);
}

export function togglePanel(panel: Exclude<SidePanel, null>): void {
  ui.panel = ui.panel === panel ? null : panel;
  if (ui.panel === 'chat') ui.unreadChat = 0;
}
