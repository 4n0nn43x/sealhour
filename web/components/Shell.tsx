"use client";
// Page frame (dashboard layout ported from the admin template: topbar, sidenav, page title, footer),
// demo badge, role selector, theme toggle, and the config gate.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "./Providers";
import { useI18n } from "@/lib/i18n";
import type { DictKey } from "@/lib/dict";
import type { Role, RoleKind } from "@/lib/roles";
import { storage } from "@/lib/storage";
import { Loading, Notice } from "./ui";

const NAV: { href: string; key: DictKey; icon: string }[] = [
  { href: "/", key: "nav.overview", icon: "ti-layout-dashboard" },
  { href: "/enrolment/", key: "nav.enrolement", icon: "ti-building-community" },
  { href: "/committee/", key: "nav.comite", icon: "ti-users-group" },
  { href: "/centre/", key: "nav.centre", icon: "ti-school" },
  { href: "/public/", key: "nav.public", icon: "ti-world" },
];

// Layout attributes on <html>: defaults in app/layout.tsx (first paint script there too), kept up to date here.
export const THEME_KEY = "sealhour.theme";
export const SIDENAV_KEY = "sealhour.sidenav";
const CONFIG_SIZE = "sm-hover-active";

/** Sidenav size for the window width, as the template's config: full on phones, condensed on tablets. */
function fitSize(): string {
  const w = window.innerWidth;
  if (w <= 767.98) return "full";
  if (w <= 1140) return "condensed";
  const saved = storage.get(SIDENAV_KEY);
  return saved === "sm-hover" || saved === "sm-hover-active" ? saved : CONFIG_SIZE;
}

function useLayout() {
  const [size, setSize] = useState<string>(() => (typeof window === "undefined" ? CONFIG_SIZE : fitSize()));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fit = () => setSize(fitSize());
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  useEffect(() => document.documentElement.setAttribute("data-sidenav-size", size), [size]);
  useEffect(() => {
    document.documentElement.classList.toggle("sidebar-enable", open);
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.documentElement.classList.remove("sidebar-enable");
      document.body.style.overflow = "";
    };
  }, [open]);

  return {
    open,
    close: () => setOpen(false),
    /** Topbar button: open the drawer on phones, otherwise switch between condensed and the configured size. */
    toggle: () => (size === "full" ? setOpen((o) => !o) : setSize((s) => (s === "condensed" ? storage.get(SIDENAV_KEY) ?? CONFIG_SIZE : "condensed"))),
    /** Sidenav button on desktop: small sidebar that expands on hover, or the full one. */
    pin: () => {
      const next = size === "sm-hover-active" ? "sm-hover" : "sm-hover-active";
      storage.set(SIDENAV_KEY, next);
      setSize(next);
    },
  };
}

function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
  html.setAttribute("data-bs-theme", next);
  storage.set(THEME_KEY, next);
}

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
    <label className="d-inline-flex align-items-center gap-2 mb-0">
      <span className={kinds ? "text-nowrap" : "text-nowrap d-none d-sm-inline"}>{label ?? t("role.label")}</span>
      <select
        className="form-select form-select-sm w-auto"
        aria-label={label ?? t("role.label")}
        value={value}
        onChange={(e) => setRole(e.target.value)}
        data-testid={kinds ? `role-${kinds.join("-")}` : "role"}
      >
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

function Topbar({ onToggle }: { onToggle: () => void }) {
  const { t } = useI18n();
  const { config } = useApp();
  return (
    <header className="app-topbar">
      <div className="page-container topbar-menu">
        <div className="d-flex align-items-center gap-2">
          <button type="button" className="sidenav-toggle-button px-2" onClick={onToggle} aria-label={t("nav.toggle")}>
            <i className="ti ti-menu-deep fs-24" aria-hidden="true" />
          </button>
          {config?.status === "ok" ? (
            <span className="badge badge-soft-warning text-uppercase fs-12" title={t("demo.badgeTitle")} data-testid="demo-badge">
              {t("demo.badge")}
            </span>
          ) : null}
        </div>
        <div className="d-flex align-items-center gap-2">
          {config?.status === "ok" ? (
            <div className="topbar-item">
              <RoleSelect />
            </div>
          ) : null}
          <div className="topbar-item">
            <button type="button" className="topbar-link" id="light-dark-mode" onClick={toggleTheme} aria-label={t("theme.toggle")} title={t("theme.toggle")}>
              <i className="ti ti-moon fs-22" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function Sidenav({ onPin, onClose }: { onPin: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const path = usePathname() ?? "/";
  return (
    <div className="sidenav-menu">
      <Link href="/" className="logo">
        <span className="logo-lg">
          <i className="ti ti-lock" aria-hidden="true" /> SealHour
        </span>
        <span className="logo-sm">
          <i className="ti ti-lock" aria-hidden="true" />
          <span className="visually-hidden">SealHour</span>
        </span>
      </Link>
      <button type="button" className="button-sm-hover" onClick={onPin} aria-label={t("nav.pin")}>
        <i className="ti ti-circle align-middle" aria-hidden="true" />
      </button>
      <button type="button" className="button-close-fullsidebar" onClick={onClose} aria-label={t("nav.close")}>
        <i className="ti ti-x align-middle" aria-hidden="true" />
      </button>
      <nav className="sidenav-scroll" aria-label={t("nav.aria")}>
        <ul className="side-nav">
          <li className="side-nav-title">{t("nav.aria")}</li>
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href.slice(0, -1));
            return (
              <li key={n.href} className={active ? "side-nav-item active" : "side-nav-item"}>
                <Link href={n.href} className={active ? "side-nav-link active" : "side-nav-link"} aria-current={active ? "page" : undefined} onClick={onClose}>
                  <span className="menu-icon">
                    <i className={`ti ${n.icon}`} aria-hidden="true" />
                  </span>
                  <span className="menu-text">{t(n.key)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function PageTitle({ title }: { title: string }) {
  const path = usePathname() ?? "/";
  return (
    <div className="page-title-head d-flex align-items-sm-center flex-sm-row flex-column gap-2">
      <div className="flex-grow-1">
        <h1 className="fs-18 fw-semibold mb-0">{title}</h1>
      </div>
      {path !== "/" ? (
        <div className="text-end">
          <ol className="breadcrumb m-0 py-0">
            <li className="breadcrumb-item">
              <Link href="/">SealHour</Link>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              {title}
            </li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export function SetupMessage({ reason }: { reason?: string }) {
  const { t } = useI18n();
  return (
    <div className="card border-warning" data-testid="setup-message">
      <div className="card-header">
        <h2 className="header-title">{t("setup.title")}</h2>
      </div>
      <div className="card-body pt-0">
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
  const { t } = useI18n();
  const layout = useLayout();
  return (
    <div className="wrapper">
      <Topbar onToggle={layout.toggle} />
      <Sidenav onPin={layout.pin} onClose={layout.close} />
      {layout.open ? <div className="offcanvas-backdrop fade show" onClick={layout.close} aria-hidden="true" /> : null}
      <div className="page-content">
        <main className="page-container" id="main">
          <PageTitle title={title} />
          {intro ? <p className="text-muted mb-3">{intro}</p> : null}
          {needsConfig ? <RequireConfig>{children}</RequireConfig> : children}
        </main>
        <footer className="footer">
          <div className="page-container">
            <div className="row">
              <div className="col-12 text-center text-md-start text-muted">{t("footer.text")}</div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
