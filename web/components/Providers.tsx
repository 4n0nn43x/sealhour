"use client";
// App wide state: runtime config (fetched once), language, and the acting demo role.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadConfig, type AppConfig, type ConfigResult } from "@/lib/config";
import { I18nProvider } from "@/lib/i18n";
import { findRole, listRoles, type Role } from "@/lib/roles";
import { storage } from "@/lib/storage";

const ROLE_KEY = "sealhour.role";

interface AppState {
  config: ConfigResult | null;
  roles: Role[];
  role: Role | undefined;
  setRole: (key: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigResult | null>(null);
  const [roleKey, setRoleKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadConfig()
      .then((r) => alive && setConfig(r))
      .catch((e: unknown) => alive && setConfig({ status: "invalid", message: String((e as Error)?.message ?? e) }));
    setRoleKey(storage.get(ROLE_KEY));
    return () => {
      alive = false;
    };
  }, []);

  const cfg = config?.status === "ok" ? config.config : null;
  const roles = useMemo(() => (cfg ? listRoles(cfg) : []), [cfg]);
  const role = useMemo(() => (cfg ? findRole(cfg, roleKey) ?? roles[0] : undefined), [cfg, roleKey, roles]);
  const setRole = useCallback((key: string) => {
    setRoleKey(key);
    storage.set(ROLE_KEY, key);
  }, []);

  const value = useMemo(() => ({ config, roles, role, setRole }), [config, roles, role, setRole]);
  return (
    <I18nProvider>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </I18nProvider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside Providers");
  return v;
}

/** The loaded config. Only call below <RequireConfig>. */
export function useConfig(): AppConfig {
  const { config } = useApp();
  if (config?.status !== "ok") throw new Error("useConfig called without a loaded config");
  return config.config;
}
