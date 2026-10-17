/**
 * Admission tickets, doc 03 section 5. The host signs a ticket binding a
 * roomId to a guest's peerId; peers verify it before creating a peer
 * connection.
 */

import { signJson, verifyJson, importPublicKey } from './sign';

export const TICKET_TTL_S = 12 * 60 * 60;

export interface Ticket {
  roomId: string;
  peerId: string;
  name: string;
  role: 'host' | 'guest';
  iat: number;
  exp: number;
}

export interface SignedTicket {
  ticket: Ticket;
  sig: string;
}

export type TicketVerdict =
  | 'valid'
  | 'expired'
  | 'wrong-room'
  | 'wrong-peer'
  | 'wrong-host'
  | 'kicked'
  | 'bad-sig'
  | 'malformed';

export async function issueTicket(
  hostKey: CryptoKey,
  opts: {
    roomId: string;
    peerId: string;
    name: string;
    role: 'host' | 'guest';
  },
  now = Date.now(),
): Promise<SignedTicket> {
  const iat = Math.floor(now / 1000);
  const ticket: Ticket = {
    roomId: opts.roomId,
    peerId: opts.peerId,
    name: opts.name,
    role: opts.role,
    iat,
    exp: iat + TICKET_TTL_S,
  };
  return { ticket, sig: await signJson(hostKey, ticket) };
}

export async function verifyTicket(
  st: SignedTicket | unknown,
  opts: {
    roomId: string;
    peerId: string;
    hostSpki: string; // expected host public key (from the link thumbprint)
    kicked?: ReadonlySet<string>;
    now?: number;
  },
): Promise<TicketVerdict> {
  const t = (st as SignedTicket | null)?.ticket;
  const sig = (st as SignedTicket | null)?.sig;
  if (
    !t ||
    typeof sig !== 'string' ||
    typeof t.roomId !== 'string' ||
    typeof t.peerId !== 'string' ||
    typeof t.iat !== 'number' ||
    typeof t.exp !== 'number' ||
    (t.role !== 'host' && t.role !== 'guest')
  ) {
    return 'malformed';
  }
  if (t.roomId !== opts.roomId) return 'wrong-room';
  if (t.peerId !== opts.peerId) return 'wrong-peer';
  if (opts.kicked?.has(t.peerId)) return 'kicked';
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (now >= t.exp || t.iat > now + 300) return 'expired';
  let hostKey: CryptoKey;
  try {
    hostKey = await importPublicKey(opts.hostSpki);
  } catch {
    return 'wrong-host';
  }
  return (await verifyJson(hostKey, t, sig)) ? 'valid' : 'bad-sig';
}
