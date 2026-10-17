/**
 * Room creation and joining, doc 03 sections 1 and 2. Owns the host identity
 * and derives topic + encryption keys from the URL fragment secret.
 */

import { randomRoomId, randomSecret, formatLink, type RoomLink } from './link';
import { generateIdentity, type IdentityKey } from '../crypto/sign';
import { deriveRoomKeys, type RoomKeys } from '../crypto/hkdf';

export interface CreatedRoom {
  link: RoomLink;
  url: string;
  host: IdentityKey;
  keys: RoomKeys;
}

/** Create a room: fresh id, secret and host ECDSA identity (extractable so it
 * can persist 24 h in IndexedDB for reload-resume). */
export async function createRoom(appUrl: string): Promise<CreatedRoom> {
  const host = await generateIdentity(true);
  const link: RoomLink = {
    roomId: randomRoomId(),
    roomSecret: randomSecret(),
    hostThumb: host.thumb,
  };
  return {
    link,
    url: formatLink(appUrl, link),
    host,
    keys: await deriveRoomKeys(link.roomSecret, link.roomId),
  };
}

/** Guest side: keys derived from the parsed link (secret + roomId only). */
export function joinRoomKeys(room: RoomLink): Promise<RoomKeys> {
  return deriveRoomKeys(room.roomSecret, room.roomId);
}
