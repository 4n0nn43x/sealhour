"use client";
// Page frame: navigation, language toggle, demo badge, role selector, and the config gate.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "./Providers";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/dict";
import type { Role, RoleKind } from "@/lib/roles";
import { Loading, Notice } from "./ui";

const NAV: { href: string; key: DictKey }[] = [
  { href: "/enrolement/", key: "nav.enrolement" },
  { href: "/comite/", key: "nav.comite" },
  { href: "/centre/", key: "nav.centre" },
  { href: "/public/", key: "nav.public" },
];

export function roleLabel(r: Role, t: (k: DictKey, v?: Record<string, string | number>) => string): string {
  switch (r.kind) {
    case "office":
      return t("role.office");
    case "committee":
      return t("role.committee", { label: r.name });
    case "centre":
      return t("role.centre", { name: r.name });
    default:
      return t("role.juror");
  }
}

export function RoleSelect({ kinds, label }: { kinds?: RoleKind[]; label?: string }) {
  const { roles, role, setRole } = useApp();
  const { t } = useI18n();
  const list = kinds ? roles.filter((r) => kinds.includes(r.kind)) : roles;
  if (list.length === 0) return null;
  const value = role && list.some((r) => r.key === role.key) ? role.key : "";
  return (
    <label className="role-select">
      <span>{label ?? t("role.label")}</span>
      <select value={value} onChange={(e) => setRole(e.target.value)} data-testid={kinds ? `role-${kinds.join("-")}` : "role"}>
        {value === "" ? <option value="">{t("role.choose")}</option> : null}
        {list.map((r) => (
          <option key={r.key} value={r.key}>
            {roleLabel(r, t)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Header() {
  const { t, lang, setLang } = useI18n();
  const { config } = useApp();
  const path = usePathname();
  return (
    <header className="site-header">
      <div className="wrap header-row">
        <Link href="/" className="brand">
          SealHour
        </Link>
        <nav aria-label={t("nav.aria")}>
          <ul>
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} aria-current={path?.startsWith(n.href.slice(0, -1)) ? "page" : undefined}>
                  {t(n.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="header-tools">
          {config?.status === "ok" ? (
            <span className="badge-demo" title={t("demo.badgeTitle")} data-testid="demo-badge">
              {t("demo.badge")}
            </span>
          ) : null}
          {config?.status === "ok" ? <RoleSelect /> : null}
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => setLang(lang === "fr" ? "en" : "fr")}
            aria-label={t("lang.switch")}
            data-testid="lang-toggle"
          >
            {lang === "fr" ? "EN" : "FR"}
          </button>
        </div>
      </div>
    </header>
  );
}

export function SetupMessage({ reason }: { reason?: string }) {
  const { t } = useI18n();
  return (
    <div className="card setup" data-testid="setup-message">
      <h2>{t("setup.title")}</h2>
      <p>{t("setup.body")}</p>
      <pre className="code">{`cd app\nmake install\nmake demo`}</pre>
      <p>{t("setup.manual")}</p>
      <pre className="code">{`app/web/public/config.json      { deployment, demo, beaconUrl, packagesBaseUrl }\napp/web/public/shared/          ${t("setup.sharedLink")}\n${t("setup.example")}  app/web/public/config.example.json`}</pre>
      {reason ? (
        <Notice tone="warn">
          {t("setup.reason")} {reason}
        </Notice>
      ) : null}
    </div>
  );
}

/** Render children only once /config.json is loaded and valid; otherwise the setup message. */
export function RequireConfig({ children }: { children: ReactNode }) {
  const { config } = useApp();
  if (config === null) return <Loading />;
  if (config.status === "missing") return <SetupMessage />;
  if (config.status === "invalid") return <SetupMessage reason={config.message} />;
  return <>{children}</>;
}

export function Page({ title, intro, children, needsConfig = true }: { title: string; intro?: string; children: ReactNode; needsConfig?: boolean }) {
  return (
    <>
      <Header />
      <main className="wrap" id="main">
        <h1>{title}</h1>
        {intro ? <p className="lead">{intro}</p> : null}
        {needsConfig ? <RequireConfig>{children}</RequireConfig> : children}
      </main>
      <footer className="site-footer wrap">
        <FooterText />
      </footer>
    </>
  );
}

function FooterText() {
  const { t } = useI18n();
  return <p className="muted">{t("footer.text")}</p>;
}
