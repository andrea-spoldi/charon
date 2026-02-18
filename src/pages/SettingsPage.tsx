import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../types";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    default_region: "us-east-1",
    aws_cli_path: "aws",
    refresh_interval_secs: 30,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    invoke<AppSettings>("get_settings").then(setSettings).catch(console.error);
  }, []);

  const handleSave = async () => {
    try {
      await invoke("save_settings", { settings });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      <div className="settings-form">
        <div className="form-field">
          <label htmlFor="default-region">Default Region</label>
          <input
            id="default-region"
            type="text"
            value={settings.default_region}
            onChange={(e) =>
              setSettings({ ...settings, default_region: e.target.value })
            }
            placeholder="us-east-1"
          />
        </div>

        <div className="form-field">
          <label htmlFor="aws-cli-path">AWS CLI Path</label>
          <input
            id="aws-cli-path"
            type="text"
            value={settings.aws_cli_path}
            onChange={(e) =>
              setSettings({ ...settings, aws_cli_path: e.target.value })
            }
            placeholder="aws"
          />
          <span className="form-hint">
            Path to the AWS CLI binary. Default: &quot;aws&quot;
          </span>
        </div>

        <div className="form-field">
          <label htmlFor="refresh-interval">
            Status Refresh Interval (seconds)
          </label>
          <input
            id="refresh-interval"
            type="number"
            min={5}
            max={300}
            value={settings.refresh_interval_secs}
            onChange={(e) =>
              setSettings({
                ...settings,
                refresh_interval_secs: parseInt(e.target.value) || 30,
              })
            }
          />
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" onClick={handleSave}>
            <Save size={16} />
            <span>{saved ? "Saved!" : "Save Settings"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
