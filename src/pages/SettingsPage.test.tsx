import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SettingsPage } from "./SettingsPage";
import type { AppSettings } from "../types";

const initialSettings: AppSettings = {
  default_region: "us-east-1",
  aws_cli_path: "aws",
  refresh_interval_secs: 30,
  session_timeout_hours: 8,
  multi_session_console: false,
};

let savedSettings: AppSettings | null;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: { settings?: AppSettings }) => {
    if (cmd === "get_settings") return initialSettings;
    if (cmd === "save_settings") {
      savedSettings = args!.settings!;
      return "Settings saved";
    }
    return null;
  }),
}));

describe("SettingsPage multi-session console toggle", () => {
  beforeEach(() => {
    savedSettings = null;
  });

  it("defaults to off and saves true once enabled", async () => {
    render(<SettingsPage />);

    const checkbox = await screen.findByLabelText(
      "Use AWS multi-session for Open AWS Console",
    );
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText("Save Settings"));

    await waitFor(() => expect(savedSettings).not.toBeNull());
    expect(savedSettings?.multi_session_console).toBe(true);
  });
});
