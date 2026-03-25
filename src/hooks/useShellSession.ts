import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface ShellSession {
  id: string;
  instanceId: string;
  instanceName: string | null;
  region: string;
  startedAt: string;
  status: "connected" | "disconnected";
}

export function useShellSession() {
  const [session, setSession] = useState<ShellSession | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onDataRef = useRef<((data: Uint8Array) => void) | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Clean up event listener on unmount
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  const startSession = useCallback(
    async (params: {
      accessToken: string;
      accountId: string;
      roleName: string;
      ssoRegion: string;
      instanceId: string;
      instanceName?: string;
      region: string;
    }) => {
      setConnecting(true);
      setError(null);
      try {
        const result = await invoke<ShellSession>("start_shell_session", {
          params,
        });
        setSession(result);

        // Listen for PTY output events
        const eventName = `shell-output-${result.id}`;
        const unlisten = await listen<string>(eventName, (event) => {
          // Decode base64 payload
          const binary = atob(event.payload);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          onDataRef.current?.(bytes);
        });
        unlistenRef.current = unlisten;

        return result;
      } catch (err) {
        setError(String(err));
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const writeInput = useCallback(
    async (data: string | Uint8Array) => {
      if (!session) return;
      // Encode to base64
      const bytes =
        typeof data === "string" ? new TextEncoder().encode(data) : data;
      const binary = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join("");
      const encoded = btoa(binary);
      await invoke("write_shell_input", {
        sessionId: session.id,
        data: encoded,
      });
    },
    [session],
  );

  const resize = useCallback(
    async (rows: number, cols: number) => {
      if (!session) return;
      await invoke("resize_shell", {
        sessionId: session.id,
        rows,
        cols,
      });
    },
    [session],
  );

  const stopSession = useCallback(async () => {
    if (!session) return;
    try {
      await invoke("stop_shell_session", { sessionId: session.id });
    } catch {
      // Ignore errors on stop
    }
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    setSession(null);
  }, [session]);

  const setOnData = useCallback((handler: (data: Uint8Array) => void) => {
    onDataRef.current = handler;
  }, []);

  return {
    session,
    connecting,
    error,
    startSession,
    writeInput,
    resize,
    stopSession,
    setOnData,
    clearError: useCallback(() => setError(null), []),
  };
}
