import { Globe, AlertCircle } from "lucide-react";
import type { SsoTokenInfo, AppSettings } from "../types";

interface StatusBarProps {
  ssoStatus: SsoTokenInfo;
  settings: AppSettings;
  error?: string | null;
}

export function StatusBar({ ssoStatus, settings, error }: StatusBarProps) {
  return (
    <footer className="statusbar">
      {error ? (
        <div className="statusbar-error">
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      ) : (
        <div className="statusbar-left" />
      )}
      <div className="statusbar-right">
        <span className="statusbar-item">
          <Globe size={12} />
          {settings.default_region}
        </span>
        {ssoStatus.status === "active" && ssoStatus.expires_at && (
          <span
            className="statusbar-item"
            title="SSO token expiry — after this you'll need to log in again"
          >
            SSO Token Expires:{" "}
            {new Date(
              ssoStatus.expires_at.replace("UTC", "Z"),
            ).toLocaleTimeString()}
          </span>
        )}
        <span
          className={`statusbar-dot ${ssoStatus.status === "active" ? "statusbar-dot-active" : "statusbar-dot-inactive"}`}
        />
      </div>
    </footer>
  );
}
