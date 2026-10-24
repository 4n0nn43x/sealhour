// Roles: who is acting in this browser. Each role maps to a wallet of the personas in cfg.demo (demo-state.json in
// demo mode, burners in the live solo test). Live roles of a connected wallet come from chain state (lib/live.ts).
import type { AppConfig, DemoAccount, DemoCentre, DemoCommittee } from "./config";

export type RoleKind = "office" | "committee" | "centre" | "juror";

export interface Role {
  key: string;
  kind: RoleKind;
  /** Committee label (A, B, R) or centre name. */
  name: string;
  account?: DemoAccount;
  committee?: DemoCommittee;
  centre?: DemoCentre;
  /** Committee set index (reserve = setCount), or centre index in demo-state. */
  index?: number;
}

export function listRoles(cfg: AppConfig): Role[] {
  const roles: Role[] = [{ key: "office", kind: "office", name: "Office", account: cfg.demo.office }];
  const committees = [...cfg.demo.committees, cfg.demo.reserveCommittee];
  for (const c of committees) {
    roles.push({ key: `committee-${c.setIndex}`, kind: "committee", name: c.label, account: c, committee: c, index: c.setIndex });
  }
  cfg.demo.centres.forEach((c, i) => {
    roles.push({ key: `centre-${i}`, kind: "centre", name: c.name, account: c, centre: c, index: i });
  });
  roles.push({ key: "juror", kind: "juror", name: "Juror", ...(cfg.demo.juror ? { account: cfg.demo.juror } : {}) });
  return roles;
}
