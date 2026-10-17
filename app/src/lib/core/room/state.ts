/**
 * Signed room state, doc 03 section 6: the single source of truth for roster,
 * lock, video slots and recording flags. Only the host signs it; peers keep
 * the highest valid seq.
 */

import { signJson, verifyJson, importPublicKey } from '../crypto/sign';

export interface RosterEntry {
  peerId: string;
  name: string;
  role: 'host' | 'guest';
}

export interface RoomState {
  roomId: string;
  seq: number;
  hostPeerId: string;
  locked: boolean;
  roster: RosterEntry[];
  videoSlots: string[];
  screenSharer: string | null;
  recording: boolean;
  noteTakers: string[];
  kicked: string[];
}

export interface SignedRoomState {
  state: RoomState;
  sig: string;
}

export function emptyState(
  roomId: string,
  hostPeerId: string,
  hostName: string,
): RoomState {
  return {
    roomId,
    seq: 1,
    hostPeerId,
    locked: false,
    roster: [{ peerId: hostPeerId, name: hostName, role: 'host' }],
    videoSlots: [hostPeerId],
    screenSharer: null,
    recording: false,
    noteTakers: [],
    kicked: [],
  };
}

export async function signState(
  state: RoomState,
  hostKey: CryptoKey,
): Promise<SignedRoomState> {
  return { state, sig: await signJson(hostKey, state) };
}

export async function verifyState(
  s: SignedRoomState | unknown,
  hostSpki: string,
): Promise<RoomState | null> {
  const st = (s as SignedRoomState | null)?.state;
  const sig = (s as SignedRoomState | null)?.sig;
  if (
    !st ||
    typeof sig !== 'string' ||
    !Array.isArray(st.roster) ||
    typeof st.seq !== 'number' ||
    typeof st.locked !== 'boolean'
  ) {
    return null;
  }
  try {
    const key = await importPublicKey(hostSpki);
    return (await verifyJson(key, st, sig)) ? st : null;
  } catch {
    return null;
  }
}

/** Structural check for the roster entries inside SignedRoomState bodies. */
export function isRoster(v: unknown): v is RosterEntry[] {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as RosterEntry).peerId === 'string' &&
        typeof (e as RosterEntry).name === 'string',
    )
  );
}
