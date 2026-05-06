import { StatusBadge } from "./StatusBadge";
import { FontSizeToggle } from "./FontSizeToggle";
import type { FontSize } from "./FontSizeToggle";
import type { SsoTokenInfo, SsoSession } from "../types";

interface TopBarProps {
  ssoStatus: SsoTokenInfo;
  sessions: SsoSession[];
  fontSize: FontSize;
  onFontSizeChange: (size: FontSize) => void;
}

export function TopBar({
  ssoStatus,
  sessions,
  fontSize,
  onFontSizeChange,
}: TopBarProps) {
  const activeSession = sessions.length > 0 ? sessions[0] : null;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-logo">Charon</span>
        <span className="topbar-subtitle">AWS Identity Center</span>
        {activeSession && (
          <span className="topbar-session">{activeSession.name}</span>
        )}
      </div>
      <div className="topbar-right">
        <FontSizeToggle fontSize={fontSize} onChange={onFontSizeChange} />
        <StatusBadge status={ssoStatus.status} />
      </div>
    </header>
  );
}
