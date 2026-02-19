import { useState, useCallback, useRef } from "react";

export interface Toast {
  id: number;
  message: string;
  type: "error" | "success" | "info";
}

export function useToast(autoDismissMs = 8000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const addToast = useCallback(
    (message: string, type: Toast["type"] = "error") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, autoDismissMs);
    },
    [autoDismissMs],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}
