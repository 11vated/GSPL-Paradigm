import { useState, useCallback } from 'react';
import * as api from '../services/api';

export function useAgent() {
  const [messages, setMessages] = useState<api.ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const send = useCallback(async (text: string) => {
    const userMsg: api.ChatMessage = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const { reply } = await api.chatWithAgent(text);
      const assistantMsg: api.ChatMessage = {
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      const errorMsg: api.ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => setMessages([]), []);

  return { messages, send, clear, loading };
}
