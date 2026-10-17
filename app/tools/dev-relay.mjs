#!/usr/bin/env node
/**
 * Dev-only signalling relay (doc 03 section 7.3): rebroadcasts every message
 * to every other client subscribed to the same topic. Used by `npm run dev`
 * and the Playwright e2e suite so no public relay is touched.
 *
 * Protocol: client sends {"t":"sub","topic":"..."} then {"t":"pub","topic":"...",
 * "data":"<outer payload>"}; server relays {"t":"msg","data":"..."} to others.
 */
import { WebSocketServer } from 'ws';

const port = Number(process.env.PORT ?? 8787);
const wss = new WebSocketServer({ port });
/** topic -> Set<WebSocket> */
const topics = new Map();

wss.on('connection', (ws) => {
  const mine = new Set();
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (m.t === 'sub' && typeof m.topic === 'string' && m.topic.length <= 64) {
      mine.add(m.topic);
      if (!topics.has(m.topic)) topics.set(m.topic, new Set());
      topics.get(m.topic).add(ws);
    } else if (
      m.t === 'pub' &&
      typeof m.topic === 'string' &&
      typeof m.data === 'string' &&
      m.data.length <= 32 * 1024
    ) {
      let delivered = 0;
      for (const peer of topics.get(m.topic) ?? []) {
        if (peer !== ws && peer.readyState === 1) {
          peer.send(JSON.stringify({ t: 'msg', data: m.data }));
          delivered++;
        }
      }
      if (process.env.RELAY_DEBUG) {
        console.log(`pub len=${m.data.length} delivered=${delivered}`);
      }
    }
  });
  ws.on('close', () => {
    for (const t of mine) {
      topics.get(t)?.delete(ws);
      if (topics.get(t)?.size === 0) topics.delete(t);
    }
  });
});

console.log(`dev-relay listening on ws://localhost:${port}`);
