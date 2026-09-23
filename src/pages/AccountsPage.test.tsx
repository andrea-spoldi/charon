import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AccountsPage } from "./AccountsPage";
import type {
  SsoTokenInfo,
  SsoAccountWithSession,
  AccountRole,
  AppSettings,
} from "../types";

const account: SsoAccountWithSession = {
  accountId: "111111111111",
  accountName: "Dev",
  emailAddress: "dev@example.com",
  sessionName: "my-sso",
  accessToken: "token-abc",
  ssoRegion: "us-east-1",
};

const role: AccountRole = {
  roleName: "Admin",
  accountId: "111111111111",
};

const ssoStatus: SsoTokenInfo = {
  status: "active",
  start_url: null,
  region: "us-east-1",
  expires_at: null,
  access_token: "global-token",
};

const baseSettings: AppSettings = {
  default_region: "us-east-1",
  aws_cli_path: "aws",
  refresh_interval_secs: 60,
  session_timeout_hours: 8,
  multi_session_console: false,
};

let invokedCommands: { cmd: string; args: unknown }[];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: unknown) => {
    invokedCommands.push({ cmd, args });
    return null;
  }),
}));

describe("AccountsPage console open command", () => {
  beforeEach(() => {
    invokedCommands = [];
  });

  it("calls open_aws_console (single-session, default) when multi_session_console is off", async () => {
    render(
      <AccountsPage
        ssoStatus={ssoStatus}
        accounts={[account]}
        roles={{ [account.accountId]: [role] }}
        loading={false}
        error={null}
        onRefresh={() => {}}
        onFetchRoles={() => {}}
        settings={baseSettings}
      />,
    );

    fireEvent.click(screen.getByText(account.accountName));

    const button = await screen.findByTitle("Open AWS Console");
    fireEvent.click(button);

    await waitFor(() =>
      expect(invokedCommands.some((c) => c.cmd === "open_aws_console")).toBe(
        true,
      ),
    );

    const call = invokedCommands.find((c) => c.cmd === "open_aws_console");
    expect(call?.args).toEqual({
      accessToken: account.accessToken,
      accountId: account.accountId,
      roleName: role.roleName,
      ssoRegion: account.ssoRegion,
      consoleRegion: baseSettings.default_region,
      sessionDurationSecs: baseSettings.session_timeout_hours * 3600,
    });
  });

  it("calls open_aws_console_multi_session when multi_session_console is enabled in settings", async () => {
    const settings: AppSettings = {
      ...baseSettings,
      multi_session_console: true,
    };

    render(
      <AccountsPage
        ssoStatus={ssoStatus}
        accounts={[account]}
        roles={{ [account.accountId]: [role] }}
        loading={false}
        error={null}
        onRefresh={() => {}}
        onFetchRoles={() => {}}
        settings={settings}
      />,
    );

    fireEvent.click(screen.getByText(account.accountName));

    const button = await screen.findByTitle("Open AWS Console (multi-session)");
    fireEvent.click(button);

    await waitFor(() =>
      expect(
        invokedCommands.some((c) => c.cmd === "open_aws_console_multi_session"),
      ).toBe(true),
    );

    const call = invokedCommands.find(
      (c) => c.cmd === "open_aws_console_multi_session",
    );
    expect(call?.args).toEqual({
      accessToken: account.accessToken,
      accountId: account.accountId,
      roleName: role.roleName,
      ssoRegion: account.ssoRegion,
      consoleRegion: settings.default_region,
      sessionDurationSecs: settings.session_timeout_hours * 3600,
    });
  });
});
