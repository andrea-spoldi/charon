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
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        return (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <Icon size={14} className="toast-icon" />
            <span className="toast-message">{toast.message}</span>
            <button
              className="toast-dismiss"
              onClick={() => onDismiss(toast.id)}
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
