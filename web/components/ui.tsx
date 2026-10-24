"use client";
// Small presentational building blocks shared by the screens.
import type { ReactNode } from "react";
import { shortHex, type TxResult } from "@/lib/chain";
import { explainError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import type { AppConfig } from "@/lib/config";

export function Section({ title, children, id, aside }: { title: string; children: ReactNode; id?: string; aside?: ReactNode }) {
  return (
    <section className="card" id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="card-head">
        <h2 id={id ? `${id}-title` : undefined}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Notice({ tone = "info", children, testId }: { tone?: "info" | "ok" | "warn" | "error"; children: ReactNode; testId?: string }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"} data-testid={testId}>
      {children}
    </div>
  );
}

export function ErrorBox({ error, cfg, prefix }: { error: unknown; cfg?: AppConfig; prefix?: string }) {
  const { t } = useI18n();
  if (error === undefined || error === null) return null;
  return (
    <Notice tone="error" testId="error">
      {prefix ? <strong>{prefix} </strong> : null}
      {explainError(error, t, cfg)}
    </Notice>
  );
}

export function Button({
  onClick,
  busy,
  disabled,
  children,
  variant = "primary",
  title,
  testId,
}: {
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  title?: string;
  testId?: string;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={`btn btn-${variant}`}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      title={title}
      data-testid={testId}
    >
      {busy ? t("common.working") : children}
    </button>
  );
}

export function Hex({ value, head = 6, tail = 4 }: { value: string | undefined | null; head?: number; tail?: number }) {
  if (!value) return <span className="muted">-</span>;
  return (
    <code className="hex" title={value}>
      {shortHex(value, head, tail)}
    </code>
  );
}

export function Chip({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  const cls = ok === null ? "chip" : ok ? "chip chip-ok" : "chip chip-bad";
  return <span className={cls}>{children}</span>;
}

export function TxOutcome({ tx }: { tx: TxResult | undefined }) {
  const { t } = useI18n();
  if (!tx) return null;
  return (
    <Notice tone="ok">
      {t("common.txDone")} <Hex value={tx.hash} /> {tx.block !== null ? t("common.inBlock", { n: tx.block }) : null}
    </Notice>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <p className="muted" role="status" aria-live="polite">
      {label ?? t("common.loading")}
    </p>
  );
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}
