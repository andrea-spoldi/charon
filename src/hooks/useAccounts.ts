import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SsoAccount, AccountRole } from "../types";

export function useAccounts() {
  const [accounts, setAccounts] = useState<SsoAccount[]>([]);
  const [roles, setRoles] = useState<Record<string, AccountRole[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoles = useCallback(
    async (accessToken: string, accountId: string, region: string) => {
      try {
        const result = await invoke<AccountRole[]>("list_account_roles", {
          accessToken,
          accountId,
          region,
        });
        setRoles((prev) => ({ ...prev, [accountId]: result }));
      } catch (err) {
        console.error(`Failed to fetch roles for ${accountId}:`, err);
        setRoles((prev) => ({ ...prev, [accountId]: [] }));
      }
    },
    [],
  );

  const fetchAccounts = useCallback(
    async (accessToken: string, region: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<SsoAccount[]>("list_sso_accounts", {
          accessToken,
          region,
        });
        setAccounts(result);
      } catch (err) {
        setError(String(err));
        setAccounts([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setAccounts([]);
    setRoles({});
    setError(null);
  }, []);

  return {
    accounts,
    roles,
    loading,
    error,
    fetchAccounts,
    fetchRoles,
    reset,
  };
}
