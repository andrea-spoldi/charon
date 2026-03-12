import { Server, KeyRound, UserCog, Settings, Cable } from "lucide-react";
import type { Page } from "../types";

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

const NAV_ITEMS: { page: Page; label: string; icon: typeof Server }[] = [
  { page: "accounts", label: "Accounts", icon: Server },
  { page: "tunnels", label: "Tunnels", icon: Cable },
  { page: "sessions", label: "Sessions", icon: KeyRound },
  { page: "profiles", label: "Profiles", icon: UserCog },
  { page: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <nav className="sidebar">
      <ul className="sidebar-nav">
        {NAV_ITEMS.map(({ page, label, icon: Icon }) => (
          <li key={page}>
            <button
              className={`sidebar-item ${activePage === page ? "active" : ""}`}
              onClick={() => onNavigate(page)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
