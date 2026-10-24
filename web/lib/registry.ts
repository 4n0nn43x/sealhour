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

export async function readExam(cfg: AppConfig, examId: string): Promise<ExamInfo> {
  const v = await registry(cfg).getExam(examId);
  return {
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
}

export async function readCentre(cfg: AppConfig, centreId: string): Promise<CentreInfo> {
  const [pubKey, operator, name, frozen] = await registry(cfg).getCentre(centreId);
  let recipient: string | null = null;
  if (pubKey !== ZERO32) {
    try {
      recipient = bytes32ToRecipient(pubKey);
    } catch {
      recipient = null;
    }
  }
  return { centreId, pubKey, recipient, operator, name, frozen };
}

/** Every centre ever registered (from CentreRegistered events), with its current state. */
export async function readAllCentres(cfg: AppConfig): Promise<CentreInfo[]> {
  const c = registry(cfg);
  const logs = await c.queryFilter(c.filters.CentreRegistered!(), 0, "latest");
  const ids: string[] = [];
  for (const l of logs) {
    const id = (l as unknown as { args?: { centreId?: string } }).args?.centreId ?? (l.topics[1] as string);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return Promise.all(ids.map((id) => readCentre(cfg, id)));
}

export async function readSnapshot(cfg: AppConfig, examId: string): Promise<ExamSnapshot> {
  const c = registry(cfg);
  const exam = await readExam(cfg, examId);
  const ids: string[] = exam.frozen ? [...(await c.examCentres(examId))] : [];
  const centres = await Promise.all(ids.map((id) => readCentre(cfg, id)));
  const packages: PackageInfo[] = [];
  if (exam.created) {
    for (let i = 0; i <= exam.setCount; i++) {
      const [root, uri, committee] = await c.packageOf(examId, i);
      const burned = i < exam.setCount ? Boolean(await c.isBurned(examId, i)) : false;
      packages.push({ setIndex: i, root, uri, committee, submitted: root !== ZERO32, burned });
    }
  }
  const participations = await Promise.all(
    ids.map(async (id) => {
      const [rcCommit, tlockedRc, joined] = await c.participation(examId, id);
      return { centreId: id, rcCommit, tlockedRc, joined } as ParticipationInfo;
    }),
  );
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
