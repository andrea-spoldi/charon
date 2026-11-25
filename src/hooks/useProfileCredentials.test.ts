import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProfileCredentials } from "./useProfileCredentials";
import type { AwsProfile, AppSettings, SsoTokenInfo } from "../types";

const profile: AwsProfile = {
  name: "dev",
  sso_session: "my-sso",
  sso_account_id: "111111111111",
  sso_role_name: "Admin",
  region: null,
  output: null,
  session_active: false,
};

const settings: AppSettings = {
  default_region: "us-east-1",
  aws_cli_path: "aws",
  refresh_interval_secs: 1,
  session_timeout_hours: 8,
  multi_session_console: false,
  auto_start_default_profile: false,
};

const ssoStatus: SsoTokenInfo = {
  status: "none",
  start_url: null,
  region: null,
  expires_at: null,
  access_token: null,
};

let configureCallCount: number;
let stopAllCallCount: number;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    switch (cmd) {
      case "get_session_sso_token":
        return {
          status: "active",
          start_url: null,
          region: "us-east-1",
          expires_at: null,
          access_token: "session-token",
        } satisfies SsoTokenInfo;
      case "configure_cli_credentials":
        configureCallCount += 1;
        // Inside the refresh window, so every tick would refresh it.
        return { message: "ok", expiresAt: Date.now() + 3000 };
      case "stop_all_sessions":
        stopAllCallCount += 1;
        return "Stopped 1 session";
      default:
        return null;
    }
  }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  configureCallCount = 0;
  stopAllCallCount = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useProfileCredentials stopAll", () => {
  it("stops every session, untracks all profiles, and stops auto-refreshing them", async () => {
    const { result } = renderHook(() =>
      useProfileCredentials({ ssoStatus, settings }),
    );
    await act(async () => {
      await result.current.start(profile);
    });
    expect(result.current.expirations).toHaveProperty("dev");
    expect(configureCallCount).toBe(1);

    let msg: string | undefined;
    await act(async () => {
      msg = await result.current.stopAll();
    });
    expect(msg).toBe("Stopped 1 session");
    expect(stopAllCallCount).toBe(1);
    expect(result.current.expirations).toEqual({});

    // A refresh tick must not rewrite the credentials that were just removed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(configureCallCount).toBe(1);
  });
});
