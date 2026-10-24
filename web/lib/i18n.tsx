"use client";
// Bilingual UI: French by default, English on toggle. Simple dictionary with {name} placeholders.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dict, type DictKey, type Lang } from "./dict";
import { storage } from "./storage";

const LANG_KEY = "sealhour.lang";

export type TFn = (key: DictKey, vars?: Record<string, string | number>) => string;

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
  /** Locale for dates and numbers. */
  locale: string;
}

const Ctx = createContext<I18n | null>(null);

export function format(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fr");
  useEffect(() => {
    const saved = storage.get(LANG_KEY);
    if (saved === "en" || saved === "fr") setLangState(saved);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storage.set(LANG_KEY, l);
  }, []);
  const t = useCallback<TFn>((key, vars) => format(dict[lang][key] ?? dict.fr[key] ?? key, vars), [lang]);
  const value = useMemo(() => ({ lang, setLang, t, locale: lang === "fr" ? "fr-FR" : "en-GB" }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}

export function formatTime(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale, { dateStyle: "short", timeStyle: "medium" });
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
