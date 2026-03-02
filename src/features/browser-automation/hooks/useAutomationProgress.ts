import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { AutomationSession, AutomationResult } from '../types';

export function useAutomationProgress(sessionId: string | null) {
  const [session, setSession] = useState<AutomationSession | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<AutomationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setSession(null);
    setLogs([]);
    setResult(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      const u1 = await listen<AutomationSession>('automation:session-update', (event) => {
        if (event.payload.id !== sessionId) return;
        setSession(event.payload);
      });

      const u2 = await listen<{ sessionId: string; message: string }>('automation:log', (event) => {
        if (event.payload.sessionId !== sessionId) return;
        setLogs((prev) => [...prev, event.payload.message]);
      });

      const u3 = await listen<{ sessionId: string; result?: AutomationResult }>('automation:completed', (event) => {
        if (event.payload.sessionId !== sessionId) return;
        if (event.payload.result) {
          setResult(event.payload.result);
        }
      });

      const u4 = await listen<{ sessionId: string; error: string }>('automation:error', (event) => {
        if (event.payload.sessionId !== sessionId) return;
        setError(event.payload.error);
      });

      const u5 = await listen<{ sessionId: string }>('automation:cancelled', (event) => {
        if (event.payload.sessionId !== sessionId) return;
        // Session state is updated via session-update event
      });

      unlisteners.push(u1, u2, u3, u4, u5);
    };

    setup();

    return () => {
      unlisteners.forEach((u) => u());
    };
  }, [sessionId]);

  return {
    session,
    logs,
    result,
    error,
    reset,
  };
}
