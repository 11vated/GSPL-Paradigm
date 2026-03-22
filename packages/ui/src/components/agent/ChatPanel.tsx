import { useState, useCallback, useRef, useEffect } from 'react';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ChatApiResponse {
  message: string;
}

interface ChatApiError {
  message?: string;
}

function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (trimmed.length === 0 || isSending) return;

    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsSending(true);

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ChatApiError | null;
        throw new Error(
          body?.message ?? `Server returned ${response.status}: ${response.statusText}`,
        );
      }

      const data = (await response.json()) as ChatApiResponse;

      const assistantMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: data.message,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const errorText =
        err instanceof Error
          ? err.message
          : 'Failed to reach agent. Is the API server running?';

      const errorMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'assistant',
        content: `[Error] ${errorText}`,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
    }
  }, [input, isSending]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
          GSPL Agent
        </h2>
      </div>

      {/* Message History */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-zinc-600">
            Start a conversation with the GSPL agent
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'ml-auto bg-green-900/20 text-green-200'
                  : 'mr-auto bg-zinc-800 text-zinc-200'
              }`}
            >
              <div className="mb-0.5 text-xs text-zinc-500">
                {msg.role === 'user' ? 'You' : 'Agent'}
              </div>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}

          {isSending && (
            <div className="mr-auto max-w-[80%] rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-500">
              <div className="mb-0.5 text-xs">Agent</div>
              <span className="animate-pulse">Thinking...</span>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-800 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the agent anything..."
            disabled={isSending}
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-50"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isSending || input.trim().length === 0}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
