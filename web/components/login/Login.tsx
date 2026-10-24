"use client";
// Login page (/login/): two doors, Osen auth page layout. Demo: the local stack and its personas (needs /config.json).
// Live testnet: connect a wallet (EIP-6963), then either act on the shared registry with roles read from chain, or
// run a solo test: the wallet funds burner wallets once, the office burner deploys a fresh registry.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { formatEther } from "ethers";
import { useApp } from "../Providers";
import { Icon, type IconName } from "../Icon";
import { LogoMark } from "../Logo";
import { Button, ErrorBox, Hex, Notice } from "../ui";
import { burnersBalance, exportBurners, FeesChangedError, forgetSolo, fundingPlan, liveProvider, readBurners, returnLeftovers, setupSolo, type Burners, type FundingPlan, type LiveBase, type ReturnResult, type SetupStep } from "@/lib/live";
import { useI18n } from "@/lib/i18n";
import { downloadText } from "@/lib/packages";
import { useAction } from "@/lib/useAction";
import { BASE_SEPOLIA_ID, walletSigner } from "@/lib/wallet";

const FAUCETS = [
  { name: "Coinbase CDP", url: "https://portal.cdp.coinbase.com/products/faucet" },
  { name: "Alchemy", url: "https://www.alchemy.com/faucets/base-sepolia" },
];

/** ETH amount with at most 6 decimals. */
export function eth(wei: bigint): string {
  const [i, d = ""] = formatEther(wei).split(".");
  const dec = d.slice(0, 6).replace(/0+$/, "");
  return `${i}${dec ? "." + dec : ""} ETH`;
}

export function ExplorerLink({ base, kind, value, children }: { base: string; kind: "address" | "tx"; value: string; children?: ReactNode }) {
  return (
    <a href={`${base}/${kind}/${value}`} target="_blank" rel="noreferrer" className="link-primary">
      {children ?? <Hex value={value} head={6} tail={4} />}
      <i className="ti ti-external-link ms-1" aria-hidden="true" />
    </a>
  );
}

function Door({ icon, title, sub, badge, children, testId }: { icon: IconName; title: string; sub: string; badge?: ReactNode; children: ReactNode; testId: string }) {
  return (
    <section className="card h-100 mb-0" aria-labelledby={`${testId}-title`} data-testid={testId}>
      <div className="card-body p-4 d-flex flex-column">
        <div className="d-flex align-items-start gap-3 mb-3">
          <div className="avatar-lg flex-shrink-0">
            <span className="avatar-title bg-primary-subtle text-primary rounded fs-32">
              <Icon name={icon} />
            </span>
          </div>
          <div className="min-w-0 flex-grow-1">
            <h2 className="fs-18 fw-semibold mb-1 d-flex flex-wrap align-items-center gap-2" id={`${testId}-title`}>
              {title} {badge}
            </h2>
            <p className="text-muted mb-0">{sub}</p>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

export function Login() {
  const { t } = useI18n();
  const router = useRouter();
  const { demoConfig, mode, setMode, live } = useApp();
  const [burners, setBurners] = useState<Burners | null>(null);
  useEffect(() => setBurners(readBurners()), []);

  const go = (m: "demo" | "live", session?: "wallet" | "solo") => {
    if (session) live.setSession({ kind: session });
    setMode(m);
    router.push("/");
  };
  const logout = () => {
    live.setSession(null);
    live.disconnect();
    setMode("demo");
  };
  const inLive = mode === "live" && live.session !== null;

  return (
    <div className="auth-bg d-flex min-vh-100 justify-content-center align-items-center">
      <main className="row g-0 justify-content-center w-100 m-xxl-5 px-xxl-4 m-3" id="main">
        <div className="col-xxl-8 col-xl-10">
          <div className="text-center mb-4">
            <Link href="/" className="auth-brand d-inline-flex align-items-center gap-2 text-reset text-decoration-none fs-22 fw-semibold mb-3">
              <LogoMark className="fs-32" />
              SealHour
            </Link>
            <h1 className="fs-22 fw-semibold mb-2">{t("login.title")}</h1>
            <p className="text-muted mb-0 mx-auto login-lead">{t("login.lead")}</p>
          </div>
          {inLive || (mode === "demo" && demoConfig?.status === "ok") ? (
            <p className="text-center mb-3" data-testid="login-current">
              <span className={`badge ${inLive ? "badge-soft-success" : "badge-soft-warning"} px-2 py-1 me-2`}>{inLive ? t("live.badge") : t("demo.badge")}</span>
              <span className="text-muted me-2">{t("login.current")}</span>
              {inLive ? (
                <button type="button" className="btn btn-sm btn-link p-0 align-baseline" onClick={logout} data-testid="logout">
                  {t("login.logout")}
                </button>
              ) : null}
            </p>
          ) : null}
          <div className="row g-3">
            <div className="col-lg-5">
              <Door icon="laptop-minimalistic-bold-duotone" title={t("login.demoTitle")} sub={t("login.demoSub")} testId="door-demo">
                <ul className="text-muted ps-3 mb-4 vstack gap-1">
                  <li>{t("login.demo1")}</li>
                  <li>{t("login.demo2")}</li>
                  <li>{t("login.demo3")}</li>
                </ul>
                <div className="mt-auto">
                  {demoConfig === null ? (
                    <p className="text-muted mb-0">{t("common.loading")}</p>
                  ) : demoConfig.status === "ok" ? (
                    <button type="button" className="btn btn-primary w-100" onClick={() => go("demo")} data-testid="enter-demo">
                      {t("login.enterDemo")}
                    </button>
                  ) : (
                    <>
                      <p className="mb-2">{t("login.demoOff")}</p>
                      <pre className="code mb-0">{`make install\nmake demo`}</pre>
                    </>
                  )}
                </div>
              </Door>
            </div>
            <div className="col-lg-7">
              <Door
                icon="wallet-bold-duotone"
                title={t("login.liveTitle")}
                sub={t("login.liveSub")}
                badge={<span className="badge badge-soft-success fs-11">{t("login.liveTag")}</span>}
                testId="door-live"
              >
                {live.baseError ? <ErrorBox error={new Error(live.baseError)} /> : !live.base ? <p className="text-muted">{t("common.loading")}</p> : <LiveDoor base={live.base} burners={burners} setBurners={setBurners} go={go} />}
              </Door>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function LiveDoor({ base, burners, setBurners, go }: { base: LiveBase; burners: Burners | null; setBurners: (b: Burners | null) => void; go: (m: "live", s: "wallet" | "solo") => void }) {
  const { t } = useI18n();
  const { live } = useApp();
  const w = live.wallet;
  const connect = useAction<void>();
  const sw = useAction<void>();
  const [balance, setBalance] = useState<bigint | null>(null);
  const onChain = w?.chainId === BASE_SEPOLIA_ID;
  useEffect(() => {
    if (!w || !onChain) return setBalance(null);
    let alive = true;
    liveProvider(base)
      .getBalance(w.address)
      .then((b) => alive && setBalance(b))
      .catch(() => alive && setBalance(null));
    return () => {
      alive = false;
    };
  }, [base, w, onChain]);

  return (
    <div className="vstack gap-3">
      {!w ? (
        <div>
          <h3 className="fs-15 fw-semibold mb-2">{t("login.connectTitle")}</h3>
          {live.wallets.length ? (
            <div className="d-flex flex-wrap gap-2">
              {live.wallets.map((x) => (
                <button key={x.uuid} type="button" className="btn btn-light d-inline-flex align-items-center gap-2" onClick={() => void connect.run(() => live.connect(x))} disabled={connect.busy} data-testid="wallet">
                  {x.icon ? <img src={x.icon} alt="" width={22} height={22} /> : <i className="ti ti-wallet fs-20" aria-hidden="true" />}
                  {t("login.connectWith", { name: x.name })}
                </button>
              ))}
            </div>
          ) : (
            <Notice tone="info" testId="no-wallet">
              {t("login.noWallet")}
            </Notice>
          )}
          <ErrorBox error={connect.error} />
        </div>
      ) : (
        <div className="d-flex flex-wrap align-items-center gap-2" data-testid="wallet-status">
          {w.info.icon ? <img src={w.info.icon} alt="" width={22} height={22} /> : <i className="ti ti-wallet fs-20" aria-hidden="true" />}
          <span>
            {t("login.connected")} <Hex value={w.address} head={6} tail={4} />
          </span>
          {onChain ? (
            <span className="badge badge-soft-success px-2 py-1">{t("live.network")}</span>
          ) : (
            <>
              <span className="badge badge-soft-danger px-2 py-1">{t("login.wrongChain")}</span>
              <Button variant="secondary" onClick={() => void sw.run(live.switchChain)} busy={sw.busy} testId="switch-chain">
                {t("login.switch")}
              </Button>
            </>
          )}
          {balance !== null ? <span className="text-muted tabular">{eth(balance)}</span> : null}
          <button type="button" className="btn btn-sm btn-link ms-auto" onClick={live.disconnect}>
            {t("login.disconnect")}
          </button>
          <div className="w-100">
            <ErrorBox error={sw.error} />
          </div>
        </div>
      )}

      {w && onChain ? (
        <>
          <div className="border-top border-dashed pt-3">
            <h3 className="fs-15 fw-semibold mb-1">{t("login.sharedTitle")}</h3>
            <p className="text-muted mb-2">
              {t("login.sharedBody")} <ExplorerLink base={base.explorer} kind="address" value={base.registry.address} />
            </p>
            <button type="button" className="btn btn-primary" onClick={() => go("live", "wallet")} data-testid="enter-shared">
              {t("login.enterShared")}
            </button>
          </div>
          <div className="border-top border-dashed pt-3">
            <h3 className="fs-15 fw-semibold mb-1">{t("login.soloTitle")}</h3>
            <p className="text-muted mb-2">{t("login.soloBody")}</p>
            <SoloSetup base={base} balance={balance} burners={burners} setBurners={setBurners} onReady={(b) => (setBurners(b), go("live", "solo"))} />
          </div>
        </>
      ) : null}

      {burners ? <BurnerPanel base={base} burners={burners} setBurners={setBurners} go={go} /> : null}

      <p className="fs-12 text-muted mb-0">
        {t("login.faucet")}{" "}
        {FAUCETS.map((f, i) => (
          <span key={f.url}>
            {i ? ", " : null}
            <a href={f.url} target="_blank" rel="noreferrer" className="link-primary">
              {f.name}
            </a>
          </span>
        ))}
        .
      </p>
    </div>
  );
}

function SoloSetup({ base, balance, burners, setBurners, onReady }: { base: LiveBase; balance: bigint | null; burners: Burners | null; setBurners: (b: Burners | null) => void; onReady: (b: Burners) => void }) {
  const { t } = useI18n();
  const { live } = useApp();
  const plan = useAction<FundingPlan>();
  const run = useAction<Burners>();
  const [steps, setSteps] = useState<SetupStep[]>([]);
  // The plan shown is the plan sent; after a fee rise the new plan replaces it and the user starts again.
  const [newer, setNewer] = useState<FundingPlan | null>(null);
  useEffect(() => {
    void plan.run(() => fundingPlan(base));
  }, [base]);
  const p = newer ?? plan.result;
  const short = p && balance !== null && balance < p.total + p.fundFee;
  const resume = Boolean(burners && !burners.registry);
  const start = () =>
    run.run(async () => {
      const w = live.wallet;
      if (!w || !p) throw new Error("NoWallet");
      setSteps([]);
      try {
        const b = await setupSolo(base, walletSigner(w.info.provider, w.address), p, (s) => setSteps((x) => [...x, s]));
        onReady(b);
        return b;
      } catch (e) {
        if (e instanceof FeesChangedError) setNewer(e.plan);
        throw e;
      } finally {
        setBurners(readBurners()); // a failed attempt keeps its burners: Return and Export stay reachable
      }
    });
  const label: Record<SetupStep["key"], string> = { keys: t("solo.keys"), fund: t("solo.fund"), distribute: t("solo.distribute"), deploy: t("solo.deploy") };
  return (
    <div>
      {p ? (
        <p className="mb-2" data-testid="solo-plan">
          {t("solo.plan", { total: eth(p.total), cost: eth(p.total / 2n) })}
        </p>
      ) : (
        <ErrorBox error={plan.error} />
      )}
      {short ? <Notice tone="warn">{t("err.NotEnoughTestEth")}</Notice> : null}
      <Button onClick={() => void start()} busy={run.busy} disabled={!p || Boolean(short)} testId="solo-start">
        {resume ? t("solo.resume") : t("solo.start")}
      </Button>
      {steps.length ? (
        <ol className="list-unstyled vstack gap-1 mt-3 mb-0" data-testid="solo-steps" aria-live="polite">
          {steps.map((s) => (
            <li key={s.key} className="d-flex flex-wrap align-items-center gap-2">
              <i className="ti ti-circle-check-filled text-success" aria-hidden="true" />
              {label[s.key]}
              {s.address ? <ExplorerLink base={base.explorer} kind="address" value={s.address} /> : s.hash ? <ExplorerLink base={base.explorer} kind="tx" value={s.hash} /> : null}
            </li>
          ))}
        </ol>
      ) : null}
      <div className="mt-2">
        <ErrorBox error={run.error} />
      </div>
    </div>
  );
}

function BurnerPanel({ base, burners, setBurners, go }: { base: LiveBase; burners: Burners; setBurners: (b: Burners | null) => void; go: (m: "live", s: "solo") => void }) {
  const { t } = useI18n();
  const { live } = useApp();
  const back = useAction<ReturnResult>();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [forget, setForget] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    burnersBalance(base, burners)
      .then((b) => alive && setBalance(b))
      .catch(() => alive && setBalance(null));
    return () => {
      alive = false;
    };
  }, [base, burners, tick]);
  const doForget = () => {
    forgetSolo(burners);
    if (live.session?.kind === "solo") live.setSession(null);
    setBurners(null);
  };
  return (
    <div className="border-top border-dashed pt-3" data-testid="burners">
      <h3 className="fs-15 fw-semibold mb-1">{t("solo.walletsTitle")}</h3>
      <p className="text-muted mb-2">
        {t("solo.walletsBody", { n: 11, balance: balance === null ? "-" : eth(balance) })}{" "}
        {burners.registry ? <ExplorerLink base={base.explorer} kind="address" value={burners.registry} /> : null}
      </p>
      <Notice tone="warn">{t("solo.keysWarning")}</Notice>
      <div className="d-flex flex-wrap gap-2">
        {burners.registry ? (
          <button type="button" className="btn btn-primary" onClick={() => go("live", "solo")} data-testid="solo-continue">
            {t("solo.continue")}
          </button>
        ) : null}
        <Button variant="secondary" onClick={() => void back.run(() => returnLeftovers(base, burners)).then(() => setTick((n) => n + 1))} busy={back.busy} testId="return-funds">
          {t("solo.return")}
        </Button>
        <Button variant="secondary" onClick={() => downloadText("sealhour-testnet-burners.json", exportBurners(burners), "application/json")} testId="export-burners">
          {t("solo.export")}
        </Button>
        <button type="button" className="btn btn-soft-danger" onClick={() => setForget(true)} aria-expanded={forget} data-testid="forget-burners">
          {t("solo.forget")}
        </button>
      </div>
      {forget ? (
        <div className="mt-2" role="group" aria-label={t("solo.forget")}>
          <p className="mb-2">{t("solo.forgetConfirm")}</p>
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-danger btn-sm" onClick={doForget} data-testid="forget-confirm">
              {t("solo.forgetYes")}
            </button>
            <button type="button" className="btn btn-light btn-sm" onClick={() => setForget(false)}>
              {t("tx.cancel")}
            </button>
          </div>
        </div>
      ) : null}
      <div className="mt-2">
        <ErrorBox error={back.error} />
        {back.result ? (
          <Notice tone="ok" testId="returned">
            {t("solo.returned", { amount: eth(back.result.returned), n: back.result.hashes.length })}
          </Notice>
        ) : null}
        {back.result?.failed.length ? (
          <Notice tone="warn" testId="return-failed">
            {t("solo.returnFailed", { n: back.result.failed.length, names: back.result.failed.map((f) => f.label).join(", ") })}
          </Notice>
        ) : null}
      </div>
    </div>
  );
}
