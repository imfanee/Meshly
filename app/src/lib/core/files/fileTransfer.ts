/**
 * Meshly file transfer (doc 06 s.2).
 *
 * `file-offer` ctl broadcast carries {id,name,size}; a receiver replies
 * `file-accept`/`file-decline`; the sender opens a `file:<id>` channel and
 * streams 16 KB chunks with 1 MB backpressure, then a JSON `done` frame with
 * the SHA-256 for verification. `file-cancel` aborts either side.
 *
 * Receivers assemble in memory (simple, works everywhere); files never
 * auto-open — the UI offers a Save action that downloads with a sanitised
 * original name.
 */

export const CHUNK = 16 * 1024;
export const MAX_FILE = 100 * 1024 * 1024;
const LOW_MARK = 1 * 1024 * 1024;

export interface TransferState {
  id: string;
  name: string;
  size: number;
  peerId: string;
  direction: 'in' | 'out';
  state: 'offered' | 'streaming' | 'done' | 'cancelled' | 'failed';
  progress: number; // bytes so far
  /** Blob once the hash verifies; UI offers a Save download. */
  blob?: Blob;
  error?: string;
}

export interface FileTransferEvents {
  onUpdate(t: TransferState): void;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isDoneFrame(data: unknown): data is { t: 'done'; sha256: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { t?: string }).t === 'done'
  );
}

export class FileTransfer {
  private sends = new Map<string, { file: File; accepted: Set<string> }>();
  private recvs = new Map<string, TransferState>();

  constructor(
    private createChannel: (peerId: string, label: string) => RTCDataChannel,
    private sendCtl: (peerId: string, body: Record<string, unknown>) => void,
    private events: FileTransferEvents,
  ) {}

  /** Offer a file to every listed peer. */
  offer(file: File, peerIds: string[]): string {
    const id = crypto.randomUUID();
    this.sends.set(id, { file, accepted: new Set() });
    for (const peerId of peerIds) {
      this.sendCtl(peerId, {
        t: 'file-offer',
        b: { id, name: file.name, size: file.size },
      });
      this.recvs.set(id, {
        id,
        name: file.name,
        size: file.size,
        peerId,
        direction: 'out',
        state: 'offered',
        progress: 0,
      });
    }
    return id;
  }

  /** Receiver side: accept an offered transfer. */
  accept(id: string, peerId: string): void {
    const t = this.recvs.get(id);
    if (!t || t.state !== 'offered') return;
    this.sendCtl(peerId, { t: 'file-accept', b: { id } });
  }

  decline(id: string, peerId: string): void {
    this.sendCtl(peerId, { t: 'file-decline', b: { id } });
    const t = this.recvs.get(id);
    if (t) {
      t.state = 'cancelled';
      this.events.onUpdate(t);
    }
  }

  cancel(id: string): void {
    const t = this.recvs.get(id);
    if (t) this.sendCtl(t.peerId, { t: 'file-cancel', b: { id } });
    if (t) {
      t.state = 'cancelled';
      this.events.onUpdate(t);
    }
    this.sends.delete(id);
  }

  /** ctl from a peer. */
  onCtl(peerId: string, msg: { t: string; b?: Record<string, unknown> }): void {
    const b = msg.b ?? {};
    const id = typeof b.id === 'string' ? b.id : '';
    if (!id) return;
    if (msg.t === 'file-offer' && typeof b.name === 'string') {
      this.recvs.set(id, {
        id,
        name: b.name.slice(0, 200),
        size: typeof b.size === 'number' ? b.size : 0,
        peerId,
        direction: 'in',
        state: 'offered',
        progress: 0,
      });
      this.events.onUpdate(this.recvs.get(id)!);
    } else if (msg.t === 'file-accept') {
      const send = this.sends.get(id);
      if (!send || send.accepted.has(peerId)) return;
      send.accepted.add(peerId);
      const t = this.recvs.get(id);
      if (t && t.peerId === peerId) {
        t.state = 'streaming';
        this.events.onUpdate(t);
      }
      void this.stream(id, peerId, send.file);
    } else if (msg.t === 'file-decline' || msg.t === 'file-cancel') {
      const t = this.recvs.get(id);
      if (t && t.peerId === peerId) {
        t.state = 'cancelled';
        this.events.onUpdate(t);
      }
    }
  }

  /** Inbound `file:<id>` channel: assemble chunks, verify SHA-256. */
  onDataChannel(peerId: string, dc: RTCDataChannel): void {
    const id = dc.label.replace(/^file:/, '');
    const t = this.recvs.get(id);
    if (!t || t.direction !== 'in') return;
    t.state = 'streaming';
    this.events.onUpdate(t);
    const chunks: ArrayBuffer[] = [];
    dc.binaryType = 'arraybuffer';
    dc.onmessage = (e) => {
      const data = e.data as ArrayBuffer | string;
      if (typeof data === 'string') {
        const frame = JSON.parse(data);
        if (isDoneFrame(frame)) void this.finish(id, chunks, frame.sha256);
        return;
      }
      chunks.push(data);
      t.progress += data.byteLength;
      if (t.progress % (4 * 1024 * 1024) < CHUNK) this.events.onUpdate(t);
    };
    dc.onclose = () => {
      if (t.state === 'streaming') {
        t.state = 'failed';
        t.error = 'channel closed';
        this.events.onUpdate(t);
      }
    };
  }

  private async stream(id: string, peerId: string, file: File): Promise<void> {
    const dc = this.createChannel(peerId, `file:${id}`);
    dc.bufferedAmountLowThreshold = LOW_MARK;
    const t = this.recvs.get(id);
    const low = () =>
      new Promise<void>((r) => {
        dc.onbufferedamountlow = () => r();
      });
    try {
      await new Promise<void>((r) => {
        if (dc.readyState === 'open') r();
        else dc.onopen = () => r();
      });
      let off = 0;
      while (off < file.size) {
        if (dc.bufferedAmount > LOW_MARK * 4) await low();
        const chunk = await file.slice(off, off + CHUNK).arrayBuffer();
        dc.send(chunk);
        off += chunk.byteLength;
        if (t) {
          t.progress = off;
          if (off % (4 * 1024 * 1024) < CHUNK) this.events.onUpdate(t);
        }
      }
      const hash = await sha256Hex(await file.arrayBuffer());
      dc.send(JSON.stringify({ t: 'done', sha256: hash }));
    } catch (err) {
      if (t) {
        t.state = 'failed';
        t.error = String(err);
        this.events.onUpdate(t);
      }
    }
  }

  private async finish(
    id: string,
    chunks: ArrayBuffer[],
    sha256: string,
  ): Promise<void> {
    const t = this.recvs.get(id);
    if (!t) return;
    const blob = new Blob(chunks);
    const hash = await sha256Hex(await blob.arrayBuffer());
    if (hash !== sha256) {
      t.state = 'failed';
      t.error = 'hash mismatch';
      this.events.onUpdate(t);
      return;
    }
    t.state = 'done';
    t.blob = blob;
    this.events.onUpdate(t);
  }

  /** Sanitised filename for the download (strip path and weird chars). */
  static safeName(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 200) || 'file';
  }
}
