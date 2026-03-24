/**
 * WebSocket server for bidirectional real-time communication.
 *
 * Runs alongside the existing SSE endpoint. Clients can send commands
 * (seed mutations, evolution, forge, agent) and receive all EventBus
 * events plus streaming responses.
 *
 * @packageDocumentation
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { EventBus } from '@paradigm/events';
import type { ParadigmEvent, WebSocketMessage } from '@paradigm/types';
import { computeQuickHash } from '@paradigm/rng';

// ─────────────────────────────────────────────
// Client Registry
// ─────────────────────────────────────────────

interface WSClient {
  readonly id: string;
  readonly ws: WebSocket;
  readonly connectedAt: number;
  lastHeartbeat: number;
  subscriptions: Set<string>;
}

// ─────────────────────────────────────────────
// WebSocket Manager
// ─────────────────────────────────────────────

export interface WSManagerOptions {
  /** Heartbeat interval in ms (default 30000). */
  readonly heartbeatIntervalMs?: number;
  /** Max clients before rejecting new connections (default 100). */
  readonly maxClients?: number;
}

/**
 * Manages WebSocket connections, heartbeats, and message routing.
 *
 * Integrates with EventBus to broadcast paradigm events to connected clients.
 * Supports client-side subscriptions to specific event types.
 */
export class WSManager {
  private readonly clients: Map<string, WSClient> = new Map();
  private readonly heartbeatIntervalMs: number;
  private readonly maxClients: number;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private wss: WebSocketServer | null = null;
  private readonly eventBus: EventBus;
  private eventBusUnsub: (() => void) | null = null;

  /** Handler for incoming client commands. Override via onMessage(). */
  private messageHandler: ((clientId: string, msg: WebSocketMessage) => void) | null = null;

  constructor(eventBus: EventBus, options?: WSManagerOptions) {
    this.eventBus = eventBus;
    this.heartbeatIntervalMs = options?.heartbeatIntervalMs ?? 30_000;
    this.maxClients = options?.maxClients ?? 100;
  }

  /**
   * Attach to an existing HTTP server and start accepting WebSocket connections.
   *
   * @param server - Node.js HTTP server to attach to.
   * @param path - URL path for WebSocket upgrade (default '/ws').
   */
  attach(server: HttpServer, path: string = '/ws'): void {
    this.wss = new WebSocketServer({ server, path });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    // Start heartbeat timer
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats();
    }, this.heartbeatIntervalMs);

    // Subscribe to all EventBus events and broadcast to clients
    this.eventBusUnsub = this.eventBus.onAny((event: ParadigmEvent) => {
      this.broadcastEvent(event);
    });
  }

  /** Set handler for incoming client messages. */
  onMessage(handler: (clientId: string, msg: WebSocketMessage) => void): void {
    this.messageHandler = handler;
  }

  /** Send a message to a specific client. */
  send(clientId: string, message: WebSocketMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /** Broadcast a message to all connected clients. */
  broadcast(message: WebSocketMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  /** Get the number of connected clients. */
  getClientCount(): number {
    return this.clients.size;
  }

  /** Get all connected client IDs. */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /** Gracefully close all connections and stop the server. */
  close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.eventBusUnsub) {
      this.eventBusUnsub();
      this.eventBusUnsub = null;
    }

    for (const client of this.clients.values()) {
      client.ws.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  // ─────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────

  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    if (this.clients.size >= this.maxClients) {
      ws.close(1013, 'Max clients reached');
      return;
    }

    const clientId = computeQuickHash({ ts: Date.now(), random: Math.random() });
    const client: WSClient = {
      id: clientId,
      ws,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      subscriptions: new Set(),
    };

    this.clients.set(clientId, client);

    // Send welcome message with client ID
    this.send(clientId, {
      id: computeQuickHash({ type: 'ack', ts: Date.now() }),
      type: 'ack',
      payload: { clientId, message: 'Connected to GSPL Paradigm WebSocket' },
      timestamp: Date.now(),
    });

    ws.on('message', (data: Buffer | string) => {
      client.lastHeartbeat = Date.now();
      this.handleMessage(clientId, data);
    });

    ws.on('close', () => {
      this.clients.delete(clientId);
    });

    ws.on('error', (err: Error) => {
      console.error(`[WSManager] Client ${clientId} error:`, err.message);
      this.clients.delete(clientId);
    });

    // Send ping for heartbeat
    ws.on('pong', () => {
      client.lastHeartbeat = Date.now();
    });
  }

  private handleMessage(clientId: string, raw: Buffer | string): void {
    try {
      const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8')) as unknown;

      if (typeof data !== 'object' || data === null || !('type' in data)) {
        this.send(clientId, {
          id: computeQuickHash({ type: 'error', ts: Date.now() }),
          type: 'error',
          payload: { error: 'Invalid message format: must have { type, payload }' },
          timestamp: Date.now(),
        });
        return;
      }

      const msg = data as WebSocketMessage;

      // Handle subscription management internally
      if (msg.type === 'subscribe') {
        const client = this.clients.get(clientId);
        const events = (msg.payload as { events?: string[] })?.events;
        if (client && Array.isArray(events)) {
          for (const event of events) {
            client.subscriptions.add(event);
          }
        }
        return;
      }

      if (msg.type === 'unsubscribe') {
        const client = this.clients.get(clientId);
        const events = (msg.payload as { events?: string[] })?.events;
        if (client && Array.isArray(events)) {
          for (const event of events) {
            client.subscriptions.delete(event);
          }
        }
        return;
      }

      // Delegate all other messages to the registered handler
      if (this.messageHandler) {
        this.messageHandler(clientId, msg);
      }
    } catch {
      this.send(clientId, {
        id: computeQuickHash({ type: 'error', ts: Date.now() }),
        type: 'error',
        payload: { error: 'Invalid JSON' },
        timestamp: Date.now(),
      });
    }
  }

  /** Broadcast a ParadigmEvent to all subscribed clients. */
  private broadcastEvent(event: ParadigmEvent): void {
    const message: WebSocketMessage = {
      id: computeQuickHash({ type: event.type, ts: Date.now() }),
      type: 'event',
      payload: event,
      timestamp: Date.now(),
    };

    const payload = JSON.stringify(message);

    for (const client of this.clients.values()) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;

      // If client has subscriptions, only send matching events
      if (client.subscriptions.size > 0 && !client.subscriptions.has(event.type)) {
        continue;
      }

      client.ws.send(payload);
    }
  }

  /** Check heartbeats and terminate stale connections. */
  private checkHeartbeats(): void {
    const now = Date.now();
    const timeout = this.heartbeatIntervalMs * 2;

    for (const [clientId, client] of this.clients) {
      if (now - client.lastHeartbeat > timeout) {
        client.ws.terminate();
        this.clients.delete(clientId);
      } else if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }
}
