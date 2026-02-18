import type { SsoSessionStatus } from "../types";

interface StatusBadgeProps {
  status: SsoSessionStatus;
}

const STATUS_CONFIG: Record<
  SsoSessionStatus,
  { color: string; label: string }
> = {
  active: { color: "var(--color-success)", label: "Connected" },
  expired: { color: "var(--color-warning)", label: "Expired" },
  none: { color: "var(--color-muted)", label: "Not connected" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span className="status-badge">
      <span className="status-dot" style={{ backgroundColor: config.color }} />
      <span className="status-label">{config.label}</span>
    </span>
  );
}
