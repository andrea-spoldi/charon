import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SessionsPage } from "./SessionsPage";
import type { SsoSession, SsoTokenInfo, DeviceAuthInfo } from "../types";

const session: SsoSession = {
  name: "my-sso",
  sso_start_url: "https://d-1234567890.awsapps.com/start/",
  sso_region: "us-east-1",
  sso_registration_scopes: "sso:account:access",
};

let pollShouldFail: boolean;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    switch (cmd) {
      case "get_session_sso_token":
        return {
          status: "none",
          start_url: null,
          region: null,
          expires_at: null,
          access_token: null,
        } satisfies SsoTokenInfo;
      case "start_device_auth":
        return {
          device_code: "dc",
          user_code: "ABCD-EFGH",
          verification_uri_complete: "https://device.sso.aws/?code=ABCD",
          client_id: "cid",
          client_secret: "secret",
          region: "us-east-1",
          start_url: session.sso_start_url,
          interval: 1,
          expires_in: 600,
        } satisfies DeviceAuthInfo;
      case "poll_device_auth":
        if (pollShouldFail) throw new Error("denied");
        return null;
      default:
        return null;
    }
  }),
}));

beforeEach(() => {
  pollShouldFail = false;
});

function renderPage(onLoggedIn = vi.fn()) {
  render(
    <SessionsPage
      sessions={[session]}
      loading={false}
      onRefresh={vi.fn()}
      onStatusChange={vi.fn()}
      onError={vi.fn()}
      onLoggedIn={onLoggedIn}
    />,
  );
  return onLoggedIn;
}

describe("SessionsPage login", () => {
  it("reports the session name after a successful SSO login", async () => {
    const onLoggedIn = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Login" }));
    await waitFor(() => expect(onLoggedIn).toHaveBeenCalledWith("my-sso"));
    expect(onLoggedIn).toHaveBeenCalledTimes(1);
  });

  it("does not report a login that failed", async () => {
    pollShouldFail = true;
    const onLoggedIn = renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Login" }));
    await screen.findByText(/denied/);
    expect(onLoggedIn).not.toHaveBeenCalled();
  });
});
