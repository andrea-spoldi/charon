import { X, AlertCircle, CheckCircle, Info } from "lucide-react";
import type { Toast } from "../hooks/useToast";

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

const icons = {
  error: AlertCircle,
  success: CheckCircle,
  info: Info,
};

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        return (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            role={toast.type === "error" ? "alert" : undefined}
          >
            <Icon size={14} className="toast-icon" />
            <span className="toast-message">{toast.message}</span>
            <button
              className="toast-dismiss"
              onClick={() => onDismiss(toast.id)}
              title="Dismiss"
              aria-label="Dismiss notification"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
