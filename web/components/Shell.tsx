"use client";
// Page frame (Osen dashboard layout: topbar, sidenav, page title, footer) and the config gate.
// Topbar: exam PhaseStepper, mode badge (demo or live), theme toggle, ActingAs. Live mode adds a permanent banner. Sidenav: Overview and the four roles, the one
// whose work is due now carries a "now" badge. With a loaded config the whole page sits in a PhaseProvider.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "./Providers";
import { useI18n } from "@/lib/i18n";
import { storage } from "@/lib/storage";
import { PhaseProvider, useOptionalPhase } from "@/lib/usePhase";
import { ActingAs, DUE, KIND, PhaseStepper } from "./Header";
import { LogoMark } from "./Logo";
import { EmptyState } from "./blocks";
import { Hex, Loading, Notice } from "./ui";
import type { AppConfig } from "@/lib/config";
import { explainError } from "@/lib/errors";
import { useAction } from "@/lib/useAction";

// Layout attributes on <html>: defaults in app/layout.tsx (first paint script there too), kept up to date here.
export const THEME_KEY = "sealhour.theme";
export const SIDENAV_KEY = "sealhour.sidenav";
const CONFIG_SIZE = "sm-hover-active";

// Same breakpoints as the CSS (and the first paint script in app/layout.tsx). Media queries, not innerWidth:
// a mobile browser zoomed out over an overflowing page reports a wider innerWidth than the CSS viewport.
const PHONE = "(max-width: 767.98px)";
const TABLET = "(max-width: 1140px)";

/** Sidenav size for the viewport, as the template's config: full (drawer) on phones, condensed on tablets. */
function fitSize(): string {
  if (window.matchMedia(PHONE).matches) return "full";
  if (window.matchMedia(TABLET).matches) return "condensed";
  const saved = storage.get(SIDENAV_KEY);
  return saved === "sm-hover" || saved === "sm-hover-active" ? saved : CONFIG_SIZE;
}

function useLayout() {
  const [size, setSize] = useState<string>(() => (typeof window === "undefined" ? CONFIG_SIZE : fitSize()));
  const [open, setOpen] = useState(false);
  const path = usePathname();

  useEffect(() => {
    const fit = () => setSize(fitSize());
    const queries = [PHONE, TABLET].map((q) => window.matchMedia(q));
    queries.forEach((m) => m.addEventListener("change", fit));
    fit();
    return () => queries.forEach((m) => m.removeEventListener("change", fit));
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-sidenav-size", size);
    if (size !== "full") setOpen(false);
  }, [size]);
  // The drawer closes on navigation and on Escape (focus back on the menu button).
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      document.querySelector<HTMLElement>(".sidenav-toggle-button")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
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
    /** Sidenav circle button: closes the drawer on phones; on desktop, small sidebar that expands on hover, or the full one. */
    pin: () => {
      if (size === "full") return setOpen(false);
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

function Topbar({ onToggle }: { onToggle: () => void }) {
  const { t } = useI18n();
  const { config } = useApp();
  const ok = config?.status === "ok";
  const live = ok && config.config.mode === "live";
  return (
    <header className="app-topbar">
      <div className="page-container topbar-menu gap-2">
        <div className="d-flex align-items-center gap-2 min-w-0">
          <button type="button" className="sidenav-toggle-button px-2 flex-shrink-0" onClick={onToggle} aria-label={t("nav.toggle")}>
            <i className="ti ti-menu-deep fs-24" aria-hidden="true" />
          </button>
          {ok ? <PhaseStepper /> : null}
        </div>
        <div className="d-flex align-items-center gap-2 flex-shrink-0">
          {live ? (
            <span className="badge badge-soft-success text-uppercase fs-11 d-none d-sm-inline-block" title={t("live.badgeTitle")} data-testid="live-badge">
              {t("live.badge")}
            </span>
          ) : ok ? (
            <span className="badge badge-soft-warning text-uppercase fs-11 d-none d-sm-inline-block" title={t("demo.badgeTitle")} data-testid="demo-badge">
              {t("demo.badge")}
            </span>
          ) : null}
          <div className="topbar-item">
            <button type="button" className="topbar-link" id="light-dark-mode" onClick={toggleTheme} aria-label={t("theme.toggle")} title={t("theme.toggle")}>
              <i className="ti ti-moon fs-22" aria-hidden="true" />
            </button>
          </div>
          {ok ? <ActingAs /> : null}
        </div>
      </div>
    </header>
  );
}

function Sidenav({ onPin, onClose }: { onPin: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const path = usePathname() ?? "/";
  const phase = useOptionalPhase();
  const due = phase && phase.snap ? DUE[phase.phase] : null;
  const item = (href: string, label: string, ti: string, badge?: ReactNode) => {
    const active = href === "/" ? path === "/" : path.startsWith(href.slice(0, -1));
    return (
      <li key={href} className={active ? "side-nav-item active" : "side-nav-item"}>
        <Link href={href} className={active ? "side-nav-link active" : "side-nav-link"} aria-current={active ? "page" : undefined} onClick={onClose}>
          <span className="menu-icon">
            <i className={`ti ${ti}`} aria-hidden="true" />
          </span>
          <span className="menu-text">{label}</span>
          {badge}
        </Link>
      </li>
    );
  };
  return (
    <div className="sidenav-menu">
      <Link href="/" className="logo">
        <span className="logo-lg">
          <LogoMark className="logo-mark" />
          SealHour
        </span>
        <span className="logo-sm">
          <LogoMark className="logo-mark" />
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
          <li className="side-nav-title">SealHour</li>
          {item("/", t("nav.overview"), "ti-layout-dashboard")}
          <li className="side-nav-title mt-2">{t("nav.roles")}</li>
          {(["office", "committee", "centre", "juror"] as const).map((k) =>
            item(
              KIND[k].href,
              t(KIND[k].title),
              KIND[k].ti,
              due === k ? (
                <span className="badge bg-success rounded-pill" title={t("home.doNow")}>
                  {t("nav.now")}
                </span>
              ) : undefined,
            ),
          )}
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
  // Public deployments (NEXT_PUBLIC_LOGIN_FIRST=1) have no local demo: send visitors to the mode choice instead.
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_LOGIN_FIRST === "1" && !reason) window.location.replace("/login/");
  }, [reason]);
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
        <p className="mb-0">
          {t("setup.live")}{" "}
          <Link href="/login/" className="link-primary fw-medium">
            {t("setup.liveLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}

/** Live mode chosen, no session yet. */
function LoginNeeded() {
  const { t } = useI18n();
  return (
    <div className="card" data-testid="login-needed">
      <EmptyState
        icon="wallet-bold-duotone"
        title={t("live.loginTitle")}
        body={t("live.loginBody")}
        action={
          <Link href="/login/" className="btn btn-primary">
            {t("live.loginAction")}
          </Link>
        }
      />
    </div>
  );
}

/** Permanent live mode banner: network, registry (explorer link), signer, wrong network switch. */
function LiveBanner({ cfg }: { cfg: AppConfig }) {
  const { t } = useI18n();
  const { live } = useApp();
  const sw = useAction<void>();
  const w = live.wallet;
  const solo = live.session?.kind === "solo";
  const wrong = !solo && w !== null && w.chainId !== cfg.deployment.chainId;
  return (
    <div className={`alert ${wrong ? "alert-warning" : "alert-success"} d-flex flex-wrap align-items-center gap-2 py-2 live-banner`} role="status" data-testid="live-banner">
      <span className="d-inline-flex align-items-center gap-2">
        <i className="ti ti-world fs-18" aria-hidden="true" />
        <strong>{t("live.bannerTitle")}</strong>
      </span>
      <span>
        {t("live.bannerRegistry")}{" "}
        <a href={`${cfg.explorer}/address/${cfg.deployment.address}`} target="_blank" rel="noreferrer" className="alert-link" data-testid="registry-link">
          <Hex value={cfg.deployment.address} />
          <i className="ti ti-external-link ms-1" aria-hidden="true" />
        </a>
      </span>
      <span className="ms-lg-auto">
        {solo ? t("live.bannerSolo") : w ? (
          <>
            {t("live.bannerWallet")} <Hex value={w.address} />
          </>
        ) : (
          <Link href="/login/" className="alert-link">
            {t("live.bannerConnect")}
          </Link>
        )}
      </span>
      {wrong ? (
        <button type="button" className="btn btn-sm btn-warning" onClick={() => void sw.run(live.switchChain)} disabled={sw.busy}>
          {t("login.switch")}
        </button>
      ) : null}
      {sw.error ? <span className="w-100">{explainError(sw.error, t, cfg)}</span> : null}
    </div>
  );
}

/** Render children only once /config.json is loaded and valid; otherwise the setup message. */
export function RequireConfig({ children }: { children: ReactNode }) {
  const { config } = useApp();
  if (config === null) return <Loading />;
  if (config.status === "missing") return <SetupMessage />;
  if (config.status === "login") return <LoginNeeded />;
  if (config.status === "invalid") return <SetupMessage reason={config.message} />;
  return <>{children}</>;
}

export function Page({ title, intro, children, needsConfig = true }: { title: string; intro?: string; children: ReactNode; needsConfig?: boolean }) {
  const { t } = useI18n();
  const { config } = useApp();
  const layout = useLayout();
  const frame = (
    <div className="wrapper">
      <Topbar onToggle={layout.toggle} />
      <Sidenav onPin={layout.pin} onClose={layout.close} />
      {layout.open ? <div className="offcanvas-backdrop fade show" onClick={layout.close} aria-hidden="true" /> : null}
      <div className="page-content">
        <main className="page-container" id="main">
          {config?.status === "ok" && config.config.mode === "live" ? <LiveBanner cfg={config.config} /> : null}
          <PageTitle title={title} />
          {intro ? <p className="text-muted mb-3">{intro}</p> : null}
          {needsConfig ? <RequireConfig>{children}</RequireConfig> : children}
        </main>
        <footer className="footer">
          <div className="page-container">
            <div className="row">
              <div className="col-12 text-center text-md-start text-muted">{t("footer.text")}</div>
              <div className="col-12 text-center text-md-start text-muted fs-12">
                <a href="https://github.com/480-Design/Solar-Icon-Set" className="text-reset" target="_blank" rel="noreferrer">
                  {t("footer.credits")}
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
  return config?.status === "ok" ? <PhaseProvider>{frame}</PhaseProvider> : frame;
}
