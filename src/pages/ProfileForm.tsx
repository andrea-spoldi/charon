import { useState } from "react";
import type { AwsProfile, SsoSession } from "../types";

interface ProfileFormProps {
  initial: AwsProfile | null;
  sessions: SsoSession[];
  onSave: (profile: AwsProfile) => void;
  onCancel: () => void;
}

export function ProfileForm({
  initial,
  sessions,
  onSave,
  onCancel,
}: ProfileFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [ssoSession, setSsoSession] = useState(initial?.sso_session ?? "");
  const [accountId, setAccountId] = useState(initial?.sso_account_id ?? "");
  const [roleName, setRoleName] = useState(initial?.sso_role_name ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      sso_session: ssoSession || null,
      sso_account_id: accountId || null,
      sso_role_name: roleName || null,
      region: region || null,
      output: initial?.output ?? null,
    });
  };

  return (
    <form className="profile-form" onSubmit={handleSubmit}>
      <div className="form-field">
        <label htmlFor="profile-name">Profile Name</label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. dev, staging, production"
          required
          disabled={!!initial}
        />
      </div>

      <div className="form-field">
        <label htmlFor="sso-session">SSO Session</label>
        <select
          id="sso-session"
          value={ssoSession}
          onChange={(e) => setSsoSession(e.target.value)}
        >
          <option value="">None</option>
          {sessions.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} ({s.sso_start_url})
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="account-id">Account ID</label>
        <input
          id="account-id"
          type="text"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          placeholder="123456789012"
        />
      </div>

      <div className="form-field">
        <label htmlFor="role-name">Role Name</label>
        <input
          id="role-name"
          type="text"
          value={roleName}
          onChange={(e) => setRoleName(e.target.value)}
          placeholder="e.g. ReadOnly, AdministratorAccess"
        />
      </div>

      <div className="form-field">
        <label htmlFor="region">Region</label>
        <input
          id="region"
          type="text"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="e.g. us-east-1, eu-west-1"
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {initial ? "Update" : "Create"} Profile
        </button>
      </div>
    </form>
  );
}
