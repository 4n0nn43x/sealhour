"use client";
// App wide state: the mode (demo or live), the runtime config of that mode, language, and the acting role (the one
// source of truth for the actor: useApp().role). Demo: /config.json and its personas. Live: lib/useLive.ts (session,
// wallet, chain-derived roles). On /public/ the actor is always the public juror, whatever was picked.
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadConfig, type AppConfig, type ConfigResult, type Mode } from "@/lib/config";
import { I18nProvider } from "@/lib/i18n";
import { listRoles, type Role } from "@/lib/roles";
import { storage } from "@/lib/storage";
import { useLive, type LiveState } from "@/lib/useLive";

const ROLE_KEY = "sealhour.role";
export const MODE_KEY = "sealhour.mode";

interface AppState {
  /** Config of the current mode; null while loading. */
  config: ConfigResult | null;
  /** /config.json, whatever the mode: the login page offers the demo door when it is ok. */
  demoConfig: ConfigResult | null;
  mode: Mode | null;
  setMode: (m: Mode) => void;
  live: LiveState;
  roles: Role[];
  role: Role | undefined;
  setRole: (key: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const [demoConfig, setDemoConfig] = useState<ConfigResult | null>(null);
  const [mode, setModeState] = useState<Mode | null>(null);
  const [roleKey, setRoleKey] = useState<string | null>(null);
  const pathname = usePathname() ?? "/";
  const live = useLive(mode === "live", mode === "live" || pathname.startsWith("/login"));

  useEffect(() => {
    let alive = true;
    loadConfig()
      .then((r) => alive && setDemoConfig(r))
      .catch((e: unknown) => alive && setDemoConfig({ status: "invalid", message: String((e as Error)?.message ?? e) }));
    setRoleKey(storage.get(ROLE_KEY));
    setModeState(storage.get(MODE_KEY) === "live" ? "live" : "demo");
    return () => {
      alive = false;
    };
  }, []);

  const setMode = useCallback((m: Mode) => {
    storage.set(MODE_KEY, m);
    setModeState(m);
  }, []);

  const config = mode === null ? null : mode === "live" ? live.config : demoConfig;
  const cfg = config?.status === "ok" ? config.config : null;
  const roles = useMemo(() => (!cfg ? [] : cfg.mode === "live" ? live.roles : listRoles(cfg)), [cfg, live.roles]);
  const isPublic = pathname.startsWith("/public");
  const role = useMemo(() => (cfg ? roles.find((r) => r.key === (isPublic ? "juror" : roleKey)) ?? roles[0] : undefined), [cfg, roleKey, roles, isPublic]);
  const setRole = useCallback((key: string) => {
    setRoleKey(key);
    storage.set(ROLE_KEY, key);
  }, []);

  const value = useMemo(() => ({ config, demoConfig, mode, setMode, live, roles, role, setRole }), [config, demoConfig, mode, setMode, live, roles, role, setRole]);
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
