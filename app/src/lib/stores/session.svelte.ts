/**
 * Session store, doc 02 section 5. What the app knows about the current
 * meeting attempt. Signalling and admission modules (T1.3 to T1.5) will drive
 * phase transitions; UI only renders state.
 */

import type { RoomLink } from '../core/room/link';

export type Phase = 'home' | 'prejoin' | 'lobby' | 'call' | 'ended';
export type Role = 'host' | 'guest';
export type EndReason = 'left' | 'ended' | 'removed' | 'error';

export const session = $state({
  phase: 'prejoin' as Phase,
  role: 'guest' as Role,
  peerId: null as string | null,
  room: null as RoomLink | null,
  link: null as string | null,
  endReason: 'left' as EndReason,
  joinedAt: null as number | null,
  /** Placeholder peer count for the shell; real roster arrives in T1.5. */
  peerCount: 1,
  lobbyState: 'waiting' as
    'waiting' | 'host-away' | 'denied' | 'full' | 'locked',
});

export function enterRoom(room: RoomLink, link: string, role: Role): void {
  session.room = room;
  session.link = link;
  session.role = role;
  session.phase = 'prejoin';
  session.endReason = 'left';
  session.lobbyState = 'waiting';
}

export function leaveRoom(reason: EndReason): void {
  session.phase = 'ended';
  session.endReason = reason;
}

export function resetSession(): void {
  session.phase = 'prejoin';
  session.role = 'guest';
  session.peerId = null;
  session.room = null;
  session.link = null;
  session.endReason = 'left';
  session.joinedAt = null;
  session.peerCount = 1;
  session.lobbyState = 'waiting';
}
