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
  chrome_path: "",
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

describe("SettingsPage Chrome location", () => {
  beforeEach(() => {
    savedSettings = null;
  });

  it("saves a custom Chrome location alongside the other settings", async () => {
    render(<SettingsPage />);

    const input = await screen.findByLabelText("Google Chrome Location");
    fireEvent.change(input, {
      target: { value: "/Applications/Chrome Beta.app/Contents/MacOS/Chrome" },
    });

    fireEvent.click(screen.getByText("Save Settings"));

    await waitFor(() => expect(savedSettings).not.toBeNull());
    expect(savedSettings?.chrome_path).toBe(
      "/Applications/Chrome Beta.app/Contents/MacOS/Chrome",
    );
  });
});
