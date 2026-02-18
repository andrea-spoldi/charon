import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import App from "./App";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    switch (cmd) {
      case "get_sso_status":
        return {
          status: "none",
          start_url: null,
          region: null,
          expires_at: null,
          access_token: null,
        };
      case "list_profiles":
        return [];
      case "list_sso_sessions":
        return [];
      case "get_settings":
        return {
          default_region: "us-east-1",
          aws_cli_path: "aws",
          refresh_interval_secs: 30,
        };
      default:
        return null;
    }
  }),
}));

describe("App", () => {
  it("renders the top bar with app name", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Charon")).toBeInTheDocument();
    });
  });

  it("renders the sidebar navigation", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Profiles")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
  });

  it("renders the accounts page by default", async () => {
    render(<App />);
    await waitFor(() => {
      const matches = screen.getAllByText("Accounts");
      expect(matches.length).toBeGreaterThanOrEqual(2); // sidebar + page heading
    });
  });

  it("renders the sessions nav item in sidebar", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Sessions")).toBeInTheDocument();
    });
  });
});
