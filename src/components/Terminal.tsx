import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  /** Called when user types in the terminal */
  onData: (data: Uint8Array) => void;
  /** Called when terminal is resized */
  onResize: (rows: number, cols: number) => void;
  /** Register a handler to write data into the terminal */
  onReady: (write: (data: Uint8Array) => void) => void;
  /** Whether the session is active */
  active: boolean;
}

export function Terminal({ onData, onResize, onReady, active }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: {
        background: "#1a1b26",
        foreground: "#c0caf5",
        cursor: "#c0caf5",
        selectionBackground: "#33467c",
        black: "#15161e",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#a9b1d6",
        brightBlack: "#414868",
        brightRed: "#f7768e",
        brightGreen: "#9ece6a",
        brightYellow: "#e0af68",
        brightBlue: "#7aa2f7",
        brightMagenta: "#bb9af7",
        brightCyan: "#7dcfff",
        brightWhite: "#c0caf5",
      },
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Forward user input to backend
    term.onData((data) => {
      const encoder = new TextEncoder();
      onData(encoder.encode(data));
    });

    // Handle binary data
    term.onBinary((data) => {
      const bytes = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        bytes[i] = data.charCodeAt(i);
      }
      onData(bytes);
    });

    // Report initial size
    onResize(term.rows, term.cols);

    // Handle resize
    term.onResize(({ rows, cols }) => {
      onResize(rows, cols);
    });

    // Provide write function to parent
    onReady((data: Uint8Array) => {
      term.write(data);
    });

    // Handle container resize
    const observer = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // Ignore fit errors during rapid resize
      }
    });
    observer.observe(containerRef.current);

    // Focus the terminal
    term.focus();

    return () => {
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  // Focus terminal when it becomes active
  useEffect(() => {
    if (active && termRef.current) {
      termRef.current.focus();
    }
  }, [active]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    />
  );
}
