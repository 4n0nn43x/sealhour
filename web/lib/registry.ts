// Typed reads of SealRegistry state used by the screens.
import { bytes32ToRecipient } from "@sealhour/seal";
import type { AppConfig } from "./config";
import { registry, ZERO32 } from "./chain";

export interface ExamInfo {
  listRoot: string;
  centreCount: number;
  openRound: number;
  revealRound: number;
  reserveOpenRound: number;
  reserveRevealRound: number;
  setCount: number;
  reserveCommittee: string;
  created: boolean;
  frozen: boolean;
}

export interface CentreInfo {
  centreId: string;
  pubKey: string;
  recipient: string | null;
  operator: string;
  name: string;
  frozen: boolean;
}

export interface PackageInfo {
  setIndex: number;
  root: string;
  uri: string;
  committee: string;
  submitted: boolean;
  burned: boolean;
}

export interface ParticipationInfo {
  centreId: string;
  rcCommit: string;
  tlockedRc: string;
  joined: boolean;
}

export interface ExamSnapshot {
  examId: string;
  exam: ExamInfo;
  centres: CentreInfo[];
  packages: PackageInfo[];
  participations: ParticipationInfo[];
}

export async function readCentre(cfg: AppConfig, centreId: string): Promise<CentreInfo> {
  const [pubKey, operator, name, frozen] = await registry(cfg).getCentre(centreId);
  return { centreId, pubKey, recipient: toRecipient(pubKey), operator, name, frozen };
}

/** Every centre ever registered (allCentres view, never a log scan), with its current state. */
export async function readAllCentres(cfg: AppConfig): Promise<CentreInfo[]> {
  const ids: string[] = [...(await registry(cfg).allCentres())];
  return Promise.all(ids.map((id) => readCentre(cfg, id)));
}

function toRecipient(pubKey: string): string | null {
  if (pubKey === ZERO32) return null;
  try {
    return bytes32ToRecipient(pubKey);
  } catch {
    return null;
  }
}

/** One examSnapshot call: exam, frozen list, packages (reserve last) and participations. */
export async function readSnapshot(cfg: AppConfig, examId: string): Promise<ExamSnapshot> {
  const [v, cs, ps, parts] = await registry(cfg).examSnapshot(examId);
  const exam: ExamInfo = {
    listRoot: v.listRoot,
    centreCount: Number(v.centreCount),
    openRound: Number(v.openRound),
    revealRound: Number(v.revealRound),
    reserveOpenRound: Number(v.reserveOpenRound),
    reserveRevealRound: Number(v.reserveRevealRound),
    setCount: Number(v.setCount),
    reserveCommittee: v.reserveCommittee,
    created: v.created,
    frozen: v.frozen,
  };
  const centres: CentreInfo[] = [...cs].map((c) => ({ centreId: c.centreId, pubKey: c.pubKey, recipient: toRecipient(c.pubKey), operator: c.operator, name: c.name, frozen: c.frozen }));
  const packages: PackageInfo[] = [...ps].map((p, i) => ({ setIndex: i, root: p.root, uri: p.uri, committee: p.committee, submitted: p.root !== ZERO32, burned: Boolean(p.burned) }));
  const participations: ParticipationInfo[] = [...parts].map((p, i) => ({ centreId: centres[i]!.centreId, rcCommit: p.rcCommit, tlockedRc: p.tlockedRc, joined: p.joined }));
  return { examId, exam, centres, packages, participations };
}

export function burnedIndexes(s: ExamSnapshot): number[] {
  return s.packages.filter((p) => p.burned).map((p) => p.setIndex);
}

/** Regular sets (not the reserve) whose package root is non zero on chain: the only ones the draw may pick. */
export function submittedIndexes(s: ExamSnapshot): number[] {
  return s.packages.filter((p) => p.submitted && p.setIndex < s.exam.setCount).map((p) => p.setIndex);
}

/** Label of a set index: committees from demo-state (A, B, ...), R for the reserve. */
export function setLabel(cfg: AppConfig, setIndex: number, setCount?: number): string {
  if (setCount !== undefined && setIndex === setCount) return cfg.demo.reserveCommittee.label || "R";
  const c = cfg.demo.committees.find((x) => x.setIndex === setIndex);
  return c?.label ?? String.fromCharCode(65 + setIndex);
}

export function centreName(cfg: AppConfig, snap: ExamSnapshot | null, centreId: string): string {
  const id = centreId.toLowerCase();
  const fromChain = snap?.centres.find((c) => c.centreId.toLowerCase() === id)?.name;
  if (fromChain) return fromChain;
  return cfg.demo.centres.find((c) => c.centreId.toLowerCase() === id)?.name ?? centreId;
}
