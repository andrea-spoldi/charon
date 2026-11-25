import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { autoStartDefaultProfile } from "./autoStartDefaultProfile";
import { useProfileCredentials } from "./useProfileCredentials";
import type { AwsProfile, AppSettings, SsoTokenInfo } from "../types";

const devProfile: AwsProfile = {
  name: "dev",
  sso_session: "my-sso",
  sso_account_id: "111111111111",
  sso_role_name: "Admin",
  region: null,
  output: null,
  session_active: false,
};

const otherProfile: AwsProfile = {
  ...devProfile,
  name: "other",
  sso_session: "other-sso",
};

let defaultName: string | null;
let profiles: AwsProfile[];
let invokedCommands: string[];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    invokedCommands.push(cmd);
    switch (cmd) {
      case "get_default_profile":
        return defaultName;
      case "list_profiles":
        return profiles;
      case "get_session_sso_token":
        return {
          status: "active",
          start_url: null,
          region: "us-east-1",
          expires_at: null,
          access_token: "session-token",
        } satisfies SsoTokenInfo;
      case "configure_cli_credentials":
        return { message: "ok", expiresAt: Date.now() + 3_600_000 };
      default:
        return null;
    }
  }),
}));

beforeEach(() => {
  defaultName = "dev";
  profiles = [devProfile, otherProfile];
  invokedCommands = [];
});

describe("autoStartDefaultProfile", () => {
  it("does nothing at all when the setting is off", async () => {
    const start = vi.fn();
    const result = await autoStartDefaultProfile({
      sessionName: "my-sso",
      enabled: false,
      start,
    });
    expect(result).toBeNull();
    expect(start).not.toHaveBeenCalled();
    expect(invokedCommands).toEqual([]);
  });

  it("skips when no default profile is set", async () => {
    defaultName = null;
    const start = vi.fn();
    const result = await autoStartDefaultProfile({
      sessionName: "my-sso",
      enabled: true,
      start,
    });
    expect(result).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  it("skips when the default profile belongs to a different session", async () => {
    defaultName = "other";
    const start = vi.fn();
    const result = await autoStartDefaultProfile({
      sessionName: "my-sso",
      enabled: true,
      start,
    });
    expect(result).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  it("skips when the default profile no longer exists", async () => {
    defaultName = "ghost";
    const start = vi.fn();
    const result = await autoStartDefaultProfile({
      sessionName: "my-sso",
      enabled: true,
      start,
    });
    expect(result).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  it("starts the default profile when it belongs to the session that logged in", async () => {
    const start = vi.fn(async () => ({ message: "ok", expiresAt: 1 }));
    const result = await autoStartDefaultProfile({
      sessionName: "my-sso",
      enabled: true,
      start,
    });
    expect(start).toHaveBeenCalledWith(devProfile);
    expect(result).toEqual(devProfile);
  });

  it("propagates a start failure to the caller", async () => {
    const start = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(
      autoStartDefaultProfile({ sessionName: "my-sso", enabled: true, start }),
    ).rejects.toThrow("boom");
  });

  it("leaves the profile tracked by the shared credential tracker", async () => {
    const settings: AppSettings = {
      default_region: "us-east-1",
      aws_cli_path: "aws",
      refresh_interval_secs: 30,
      session_timeout_hours: 8,
      multi_session_console: false,
      auto_start_default_profile: true,
    };
    const ssoStatus: SsoTokenInfo = {
      status: "none",
      start_url: null,
      region: null,
      expires_at: null,
      access_token: null,
    };
    const { result } = renderHook(() =>
      useProfileCredentials({ ssoStatus, settings }),
    );
    await act(async () => {
      await autoStartDefaultProfile({
        sessionName: "my-sso",
        enabled: true,
        start: result.current.start,
      });
    });
    expect(result.current.expirations).toHaveProperty("dev");
    expect(invokedCommands).toContain("configure_cli_credentials");
  });
});
