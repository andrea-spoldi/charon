import { LogIn, LogOut } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { StatusBadge } from "./StatusBadge";
import type { SsoTokenInfo, SsoSession } from "../types";

interface TopBarProps {
  ssoStatus: SsoTokenInfo;
  sessions: SsoSession[];
  onStatusChange: () => void;
  onLogin: () => void;
}

export function TopBar({
  ssoStatus,
  sessions,
  onStatusChange,
  onLogin,
}: TopBarProps) {
  const activeSession = sessions.length > 0 ? sessions[0] : null;

  const handleLogout = async () => {
    try {
      await invoke("sso_logout");
      onStatusChange();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

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
        <StatusBadge status={ssoStatus.status} />
        {ssoStatus.status === "active" ? (
          <button className="topbar-btn" onClick={handleLogout} title="Logout">
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        ) : (
          <button
            className="topbar-btn topbar-btn-primary"
            onClick={onLogin}
            disabled={sessions.length === 0}
            title={
              sessions.length === 0
                ? "No SSO sessions configured"
                : "Login to SSO"
            }
          >
            <LogIn size={16} />
            <span>Login</span>
          </button>
        )}
      </div>
    </header>
  );
}
