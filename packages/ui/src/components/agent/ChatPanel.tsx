import { useRef, useEffect, useCallback, useState } from 'react';
import { useAgentStore, type ChatMessage, type AutonomyMode } from '../../stores/agentStore';
import { Panel } from '../common/Panel';

const AUTONOMY_MODES: { id: AutonomyMode; label: string; desc: string }[] = [
  { id: 'supervised', label: 'Supervised', desc: 'Approve every tool call' },
  { id: 'copilot', label: 'Co-pilot', desc: 'Agent acts, you review' },
  { id: 'autonomous', label: 'Autonomous', desc: 'Full autonomy' },
];

import type { ReactNode } from 'react';

/** Simple markdown-like rendering: bold, code, code blocks, lists. */
function renderContent(text: string): ReactNode {
  const lines = text.split('\n');
  const elements: ReactNode[] = [];

  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="my-2 overflow-x-auto rounded-md bg-[var(--color-bg)] p-3 font-mono text-xs leading-relaxed text-[var(--color-text-secondary)]">
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Inline formatting
    const formatted = line
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[var(--color-text)]">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="rounded bg-[var(--color-surface-raised)] px-1 py-0.5 font-mono text-xs text-[var(--color-cyan)]">$1</code>')
      .replace(/^[-*] (.+)$/, '<span class="flex gap-1.5"><span class="text-[var(--color-text-dim)]">•</span><span>$1</span></span>');

    elements.push(
      <div key={i} dangerouslySetInnerHTML={{ __html: formatted || '&nbsp;' }} />
    );
  }

  // Unclosed code block
  if (inCodeBlock && codeBuffer.length > 0) {
    elements.push(
      <pre key="code-end" className="my-2 overflow-x-auto rounded-md bg-[var(--color-bg)] p-3 font-mono text-xs text-[var(--color-text-secondary)]">
        <code>{codeBuffer.join('\n')}</code>
      </pre>
    );
  }

  return <div className="flex flex-col gap-0.5">{elements}</div>;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`max-w-[85%] ${isUser ? 'ml-auto' : 'mr-auto'}`}>
      <div
        className={`rounded-lg px-3.5 py-2.5 text-sm ${
          isUser
            ? 'bg-[var(--color-primary)] text-white'
            : isSystem
              ? 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'
              : 'bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          renderContent(message.content)
        )}
      </div>

      {/* Tool usage indicator */}
      {message.toolsUsed && message.toolsUsed.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {message.toolsUsed.map((tool) => (
            <span
              key={tool}
              className="rounded bg-[var(--color-violet-glow)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-violet)]"
            >
              {tool}
            </span>
          ))}
        </div>
      )}

      {/* Intent badge */}
      {message.intent && (
        <span className="mt-1 inline-block rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[10px] text-[var(--color-text-dim)]">
          intent: {message.intent}
        </span>
      )}

      {/* Timestamp */}
      <div className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">
        {new Date(message.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const messages = useAgentStore((s) => s.messages);
  const thinking = useAgentStore((s) => s.thinking);
  const autonomyMode = useAgentStore((s) => s.autonomyMode);
  const setAutonomyMode = useAgentStore((s) => s.setAutonomyMode);
  const sendMessage = useAgentStore((s) => s.sendMessage);
  const clearMessages = useAgentStore((s) => s.clearMessages);
  const error = useAgentStore((s) => s.error);

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (trimmed.length === 0 || thinking) return;
    setInput('');
    await sendMessage(trimmed);
  }, [input, thinking, sendMessage]);

  return (
    <div className="flex h-full flex-col">
      {/* Header with autonomy mode */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
            GSPL Agent
          </h2>
          {thinking && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--color-cyan)]">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-cyan)]" />
              Thinking
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Autonomy mode selector */}
          <div className="flex rounded-md bg-[var(--color-surface-raised)]">
            {AUTONOMY_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setAutonomyMode(mode.id)}
                title={mode.desc}
                className={`px-2 py-1 text-[10px] font-medium transition-colors first:rounded-l-md last:rounded-r-md ${
                  autonomyMode === mode.id
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={clearMessages}
            className="rounded-md px-2 py-1 text-[10px] text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && !thinking && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--color-text-dim)]">
            <span className="text-3xl opacity-30">&#x1F4AC;</span>
            <p className="text-sm">Chat with the GSPL Agent</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {['Create a fire dragon', 'Evolve my seeds', 'Forge an HTML game', 'What seeds exist?'].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => { setInput(suggestion); }}
                  className="rounded-full bg-[var(--color-surface-raised)] px-3 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {thinking && (
            <div className="mr-auto max-w-[85%] rounded-lg bg-[var(--color-surface-raised)] px-3.5 py-2.5 text-sm">
              <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-cyan)]" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-cyan)]" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-cyan)]" style={{ animationDelay: '300ms' }} />
                </span>
                Processing...
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="border-t border-red-800/50 bg-[var(--color-danger-bg)] px-4 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[var(--color-border)] p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the agent anything..."
            disabled={thinking}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] disabled:opacity-50"
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
            disabled={thinking || input.trim().length === 0}
            className="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-dim)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
