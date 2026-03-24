import { Globe, AlertCircle } from "lucide-react";
import type { SsoTokenInfo, AppSettings } from "../types";

interface StatusBarProps {
  ssoStatus: SsoTokenInfo;
  settings: AppSettings;
  defaultProfile?: string | null;
  profileExpiration?: number | null;
  error?: string | null;
}

export function StatusBar({
  ssoStatus,
  settings,
  defaultProfile,
  profileExpiration,
  error,
}: StatusBarProps) {
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
            SSO Expires:{" "}
            {new Date(
              ssoStatus.expires_at.replace("UTC", "Z"),
            ).toLocaleTimeString()}
          </span>
        )}
        {ssoStatus.status === "active" &&
          profileExpiration != null &&
          defaultProfile && (
            <span
              className="statusbar-item"
              title={`Profile "${defaultProfile}" credential expiry — credentials auto-refresh on use`}
            >
              Profile Expires:{" "}
              {new Date(profileExpiration).toLocaleTimeString()}
            </span>
          )}
        <span
          className={`statusbar-dot ${ssoStatus.status === "active" ? "statusbar-dot-active" : "statusbar-dot-inactive"}`}
        />
      </div>
    </footer>
  );
}
