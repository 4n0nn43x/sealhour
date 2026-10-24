"use client";
// Small presentational building blocks shared by the screens (Bootstrap and template classes).
// The notice-*, chip-* (and .big in OpenPanel) class names are kept as stable hooks for scripts/e2e-live.mjs.
import type { ReactNode } from "react";
import { shortHex, type TxResult } from "@/lib/chain";
import { explainError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import type { AppConfig } from "@/lib/config";

export function Section({ title, children, id, aside }: { title: string; children: ReactNode; id?: string; aside?: ReactNode }) {
  return (
    <section className="card" id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
        <h2 className="header-title" id={id ? `${id}-title` : undefined}>
          {title}
        </h2>
        {aside}
      </div>
      <div className="card-body pt-0">{children}</div>
    </section>
  );
}

const ALERT = { info: "info", ok: "success", warn: "warning", error: "danger" } as const;

export function Notice({ tone = "info", children, testId }: { tone?: "info" | "ok" | "warn" | "error"; children: ReactNode; testId?: string }) {
  return (
    <div className={`alert alert-${ALERT[tone]} text-break notice notice-${tone}`} role={tone === "error" ? "alert" : "status"} data-testid={testId}>
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

const BTN = { primary: "btn-primary", secondary: "btn-light", danger: "btn-danger" } as const;

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
      className={`btn ${BTN[variant]}`}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      title={title}
      data-testid={testId}
    >
      {busy ? (
        <>
          <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
          {t("common.working")}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function Hex({ value, head = 6, tail = 4 }: { value: string | undefined | null; head?: number; tail?: number }) {
  if (!value) return <span className="text-muted">-</span>;
  return (
    <code className="hex" title={value}>
      {shortHex(value, head, tail)}
    </code>
  );
}

export function Chip({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  const cls = ok === null ? "badge badge-soft-secondary chip" : ok ? "badge badge-soft-success chip chip-ok" : "badge badge-soft-danger chip chip-bad";
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
    <p className="text-muted" role="status" aria-live="polite">
      <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
      {label ?? t("common.loading")}
    </p>
  );
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="mb-3">
      <label className="form-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <div className="form-text">{hint}</div> : null}
    </div>
  );
}
