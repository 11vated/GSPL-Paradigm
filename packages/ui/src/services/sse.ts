export type SSEHandler = (event: { type: string; data: unknown }) => void;

export class SSEClient {
  private source: EventSource | null = null;
  private handlers: Map<string, Set<SSEHandler>> = new Map();

  connect(url: string = '/api/events'): void {
    this.disconnect();
    this.source = new EventSource(url);

    this.source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as { type: string; [key: string]: unknown };
        this.dispatch(parsed.type, parsed);
      } catch {
        // Ignore unparseable events
      }
    };

    this.source.onerror = () => {
      // Auto-reconnect is built into EventSource
    };
  }

  disconnect(): void {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }

  on(eventType: string, handler: SSEHandler): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
    return () => this.handlers.get(eventType)?.delete(handler);
  }

  private dispatch(type: string, data: unknown): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        handler({ type, data });
      }
    }
    // Also dispatch to wildcard listeners
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        handler({ type, data });
      }
    }
  }
}

export const sseClient = new SSEClient();
