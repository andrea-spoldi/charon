import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProfilesPage } from "./ProfilesPage";
import type { AwsProfile, SsoTokenInfo, AppSettings } from "../types";

const profile: AwsProfile = {
  name: "dev",
  sso_session: "my-sso",
  sso_account_id: "111111111111",
  sso_role_name: "Admin",
  region: null,
  output: null,
  session_active: false,
};

let profileState: AwsProfile;
let sessionStatus: "active" | "expired";
let configureCallCount: number;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    switch (cmd) {
      case "list_profiles":
        return [profileState];
      case "list_sso_sessions":
        return [];
      case "get_default_profile":
        return null;
      case "get_session_sso_token":
        return {
          status: sessionStatus,
          start_url: null,
          region: "us-east-1",
          expires_at: null,
          access_token: "session-token",
        } satisfies SsoTokenInfo;
      case "configure_cli_credentials":
        configureCallCount += 1;
        profileState = { ...profileState, session_active: true };
        return { message: "ok", expiresAt: Date.now() + 1000 };
      default:
        return null;
    }
  }),
}));

const ssoStatus: SsoTokenInfo = {
  status: "active",
  start_url: null,
  region: "us-east-1",
  expires_at: null,
  access_token: "global-token",
};

const settings: AppSettings = {
  default_region: "us-east-1",
  aws_cli_path: "aws",
  refresh_interval_secs: 1,
  session_timeout_hours: 8,
};

describe("ProfilesPage auto-refresh", () => {
  beforeEach(() => {
    profileState = { ...profile };
    sessionStatus = "active";
    configureCallCount = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-refreshes a profile's credentials before expiry while its SSO session is active", async () => {
    render(
      <ProfilesPage
        ssoStatus={ssoStatus}
        settings={settings}
        onError={() => {}}
      />,
    );

    await vi.waitFor(() =>
      expect(screen.getByTitle("Start CLI session")).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByTitle("Start CLI session"));
      await vi.waitFor(() => expect(configureCallCount).toBe(1));
    });

    // Credentials expire in ~1s; advance past the 1s refresh interval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    await vi.waitFor(() => expect(configureCallCount).toBe(2));
  });

  it("does not refresh a profile once its SSO session has expired", async () => {
    render(
      <ProfilesPage
        ssoStatus={ssoStatus}
        settings={settings}
        onError={() => {}}
      />,
    );

    await vi.waitFor(() =>
      expect(screen.getByTitle("Start CLI session")).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByTitle("Start CLI session"));
      await vi.waitFor(() => expect(configureCallCount).toBe(1));
    });

    // The session expires before the credentials do.
    sessionStatus = "expired";

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // No-op expected: the auto-refresh loop must skip inactive sessions.
    expect(configureCallCount).toBe(1);
  });
});
