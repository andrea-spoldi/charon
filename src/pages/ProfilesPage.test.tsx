import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { ProfilesPage } from "./ProfilesPage";
import { useProfileCredentials } from "../hooks/useProfileCredentials";
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

// A second profile whose session_active flag is stale/persisted from a
// previous run (e.g. Played long ago and never Stopped) but was NOT
// Played in the current page session.
const staleActiveProfile: AwsProfile = {
  name: "staging",
  sso_session: "my-sso",
  sso_account_id: "222222222222",
  sso_role_name: "ReadOnly",
  region: null,
  output: null,
  session_active: true,
};

let profileState: AwsProfile;
let profilesListState: AwsProfile[];
let sessionStatus: "active" | "expired";
let configureCallCount: number;
let getRoleCredentialsCallCount: number;
let stopSessionCallCount: number;
let multiSessionConsoleCalls: unknown[];
let singleSessionConsoleCalls: unknown[];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: unknown) => {
    switch (cmd) {
      case "open_aws_console_multi_session":
        multiSessionConsoleCalls.push(args);
        return null;
      case "open_aws_console":
        singleSessionConsoleCalls.push(args);
        return null;
      case "list_profiles":
        return profilesListState;
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
      case "get_role_credentials":
        getRoleCredentialsCallCount += 1;
        return { expiration: Date.now() + 1000 };
      case "stop_session":
        stopSessionCallCount += 1;
        profileState = { ...profileState, session_active: false };
        profilesListState = [profileState];
        return "stopped";
      case "configure_cli_credentials":
        configureCallCount += 1;
        profileState = { ...profileState, session_active: true };
        profilesListState = [profileState];
        // Expire well after the 1s refresh tick, so the first tick lands
        // inside the "about to expire" window rather than "already expired".
        return { message: "ok", expiresAt: Date.now() + 3000 };
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
  multi_session_console: false,
  auto_start_default_profile: false,
};

// Mirrors App.tsx: credential tracking lives above ProfilesPage, so it
// survives ProfilesPage unmounting when the user navigates elsewhere.
function Harness({
  settings: harnessSettings,
  showProfiles = true,
}: {
  settings: AppSettings;
  showProfiles?: boolean;
}) {
  const credentials = useProfileCredentials({
    ssoStatus,
    settings: harnessSettings,
  });
  return showProfiles ? (
    <ProfilesPage
      ssoStatus={ssoStatus}
      settings={harnessSettings}
      credentials={credentials}
      onError={() => {}}
    />
  ) : null;
}

function NavigableHarness() {
  const [showProfiles, setShowProfiles] = useState(true);
  return (
    <>
      <button onClick={() => setShowProfiles((v) => !v)}>toggle-nav</button>
      <Harness settings={settings} showProfiles={showProfiles} />
    </>
  );
}

describe("ProfilesPage auto-refresh", () => {
  beforeEach(() => {
    profileState = { ...profile };
    profilesListState = [profileState];
    sessionStatus = "active";
    configureCallCount = 0;
    getRoleCredentialsCallCount = 0;
    stopSessionCallCount = 0;
    multiSessionConsoleCalls = [];
    singleSessionConsoleCalls = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-refreshes a profile's credentials before expiry while its SSO session is active", async () => {
    render(<Harness settings={settings} />);

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
    render(<Harness settings={settings} />);

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

  it("never touches a profile that wasn't Played this session, even if its stored session_active flag is stale", async () => {
    profilesListState = [profileState, staleActiveProfile];

    render(<Harness settings={settings} />);

    await vi.waitFor(() =>
      expect(screen.getByText(staleActiveProfile.name)).toBeInTheDocument(),
    );

    // Give the mount effects and one full refresh-interval tick a chance to run.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(getRoleCredentialsCallCount).toBe(0);
    expect(configureCallCount).toBe(0);

    // Its persisted session_active flag is stale (true), but since it wasn't
    // Played this session it should show "Play", not "Stop".
    const staleCard = screen
      .getByText(staleActiveProfile.name)
      .closest(".profile-card") as HTMLElement;
    expect(
      within(staleCard).getByTitle("Start CLI session"),
    ).toBeInTheDocument();
    expect(
      within(staleCard).queryByTitle("Stop CLI session"),
    ).not.toBeInTheDocument();
  });

  it("reverts to Play once a tracked profile's credentials actually expire without being refreshed", async () => {
    render(<Harness settings={settings} />);

    await vi.waitFor(() =>
      expect(screen.getByTitle("Start CLI session")).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByTitle("Start CLI session"));
      await vi.waitFor(() => expect(configureCallCount).toBe(1));
    });

    await vi.waitFor(() =>
      expect(screen.getByTitle("Stop CLI session")).toBeInTheDocument(),
    );

    // The session dies before the ~3s credentials do, so no refresh can happen.
    sessionStatus = "expired";

    // Advance past the actual 3s expiry.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });

    expect(configureCallCount).toBe(1);
    await vi.waitFor(() => expect(stopSessionCallCount).toBe(1));
    await vi.waitFor(() =>
      expect(screen.getByTitle("Start CLI session")).toBeInTheDocument(),
    );
    expect(screen.queryByTitle("Stop CLI session")).not.toBeInTheDocument();
  });

  it("calls open_aws_console (single-session, default) when multi_session_console is off", async () => {
    render(<Harness settings={settings} />);

    await vi.waitFor(() =>
      expect(screen.getByTitle("Open AWS Console")).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByTitle("Open AWS Console"));
      await vi.waitFor(() => expect(singleSessionConsoleCalls.length).toBe(1));
    });

    expect(singleSessionConsoleCalls[0]).toEqual({
      accessToken: "session-token",
      accountId: profile.sso_account_id,
      roleName: profile.sso_role_name,
      ssoRegion: "us-east-1",
      consoleRegion: settings.default_region,
      sessionDurationSecs: settings.session_timeout_hours * 3600,
    });
    expect(multiSessionConsoleCalls.length).toBe(0);
  });

  it("calls open_aws_console_multi_session when multi_session_console is enabled in settings", async () => {
    const multiSessionSettings: AppSettings = {
      ...settings,
      multi_session_console: true,
    };

    render(<Harness settings={multiSessionSettings} />);

    await vi.waitFor(() =>
      expect(
        screen.getByTitle("Open AWS Console (multi-session)"),
      ).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByTitle("Open AWS Console (multi-session)"));
      await vi.waitFor(() => expect(multiSessionConsoleCalls.length).toBe(1));
    });

    expect(multiSessionConsoleCalls[0]).toEqual({
      accessToken: "session-token",
      accountId: profile.sso_account_id,
      roleName: profile.sso_role_name,
      ssoRegion: "us-east-1",
      consoleRegion: multiSessionSettings.default_region,
      sessionDurationSecs: multiSessionSettings.session_timeout_hours * 3600,
    });
    expect(singleSessionConsoleCalls.length).toBe(0);
  });

  it("keeps tracking and auto-refreshing a Played profile after navigating away from Profiles and back", async () => {
    render(<NavigableHarness />);

    await vi.waitFor(() =>
      expect(screen.getByTitle("Start CLI session")).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByTitle("Start CLI session"));
      await vi.waitFor(() => expect(configureCallCount).toBe(1));
    });

    // Navigate away: ProfilesPage unmounts.
    fireEvent.click(screen.getByText("toggle-nav"));
    expect(screen.queryByTitle("Stop CLI session")).not.toBeInTheDocument();

    // Auto-refresh must keep running while ProfilesPage is not mounted.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await vi.waitFor(() => expect(configureCallCount).toBe(2));

    // Navigate back: the row still shows Stop.
    fireEvent.click(screen.getByText("toggle-nav"));
    await vi.waitFor(() =>
      expect(screen.getByTitle("Stop CLI session")).toBeInTheDocument(),
    );
  });
});
