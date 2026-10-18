/**
 * Meshly local recorder (doc 06 s.5, host only).
 *
 * MediaRecorder over the compositor output, 5 s timeslice.
 * Sinks: File System Access streaming on Chromium (flat memory), OPFS
 * buffer + download elsewhere (with the WebM duration fix applied at stop).
 * OPFS `.part` files left by a crash are offered for recovery on next load.
 */

import fixWebmDuration from 'fix-webm-duration';

const MIME = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
].find((m) => MediaRecorder.isTypeSupported(m));
const PART = 'meshly-recording.part';

type FileHandle = {
  createWritable(): Promise<{
    write(d: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
};

declare global {
  interface Window {
    showSaveFilePicker?(o: {
      suggestedName?: string;
      types?: { description: string; accept: Record<string, string[]> }[];
    }): Promise<FileHandle>;
  }
}

export type RecorderState = 'idle' | 'recording' | 'stopping' | 'done';

export class Recorder {
  private rec: MediaRecorder | null = null;
  private writable: {
    write(d: Blob): Promise<void>;
    close(): Promise<void>;
  } | null = null;
  private opfsFile: FileSystemFileHandle | null = null;
  private chunks: Blob[] = [];
  state: RecorderState = 'idle';

  /** File System Access streaming path, else OPFS buffered path. */
  async start(
    stream: MediaStream,
    opts: { preferOpfs?: boolean } = {},
  ): Promise<void> {
    if (this.rec) return;
    this.rec = new MediaRecorder(stream, { mimeType: MIME });
    const name = `meshly-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.webm`;

    if (window.showSaveFilePicker && !opts.preferOpfs) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [
            {
              description: 'WebM video',
              accept: { 'video/webm': ['.webm'] },
            },
          ],
        });
        this.writable = await handle.createWritable();
      } catch {
        return; // user cancelled the picker
      }
    } else {
      const dir = await navigator.storage.getDirectory();
      this.opfsFile = await dir.getFileHandle(PART, { create: true });
      const w = await this.opfsFile.createWritable();
      this.writable = w;
    }

    this.rec.ondataavailable = (e) => {
      if (e.data.size) {
        this.chunks.push(e.data);
        void this.writable?.write(e.data);
      }
    };
    this.rec.start(5_000);
    this.state = 'recording';
  }

  /** Stop: close the sink, fix the WebM duration on the buffered path. */
  async stop(): Promise<Blob | null> {
    const rec = this.rec;
    if (!rec) return null;
    this.state = 'stopping';
    await new Promise<void>((r) => {
      rec.onstop = () => r();
      rec.stop();
    });
    await this.writable?.close();
    this.rec = null;
    this.writable = null;

    if (this.opfsFile) {
      // Buffered path: read back, fix duration, return for download.
      const file = await this.opfsFile.getFile();
      const fixed = await this.fixDuration(file);
      const dir = await navigator.storage.getDirectory();
      await dir.removeEntry(PART).catch(() => undefined);
      this.opfsFile = null;
      this.state = 'done';
      return fixed;
    }
    // FS-streamed file is already on disk with a seekable duration? It is
    // a live-muxed stream too, so patch it the same way when we can.
    this.state = 'done';
    return null;
  }

  private async fixDuration(blob: Blob): Promise<Blob> {
    try {
      return await fixWebmDuration(blob, Date.now());
    } catch {
      return blob;
    }
  }

  /** OPFS `.part` left behind by a crash: offer it for recovery. */
  static async findOrphaned(): Promise<Blob | null> {
    try {
      const dir = await navigator.storage.getDirectory();
      const h = await dir.getFileHandle(PART);
      const f = await h.getFile();
      await dir.removeEntry(PART).catch(() => undefined);
      return f.size ? f : null;
    } catch {
      return null;
    }
  }
}
