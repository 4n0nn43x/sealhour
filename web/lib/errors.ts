// Turn any failure (contract revert, seal error, network) into a plain language sentence.
import { revertName } from "./chain";
import type { AppConfig } from "./config";
import type { DictKey } from "./dict";
import type { TFn } from "./i18n";

export type ErrorKind =
  | "TooEarlyError"
  | "WrongKeyError"
  | "BadSignatureError"
  | "network"
  | "rejected"
  | "funds"
  | "other";

export function errorKind(e: unknown): ErrorKind {
  const err = e as { name?: string; code?: string; message?: string } | undefined;
  const name = err?.name ?? "";
  if (name === "TooEarlyError" || name === "WrongKeyError" || name === "BadSignatureError") return name;
  if (err?.code === "ACTION_REJECTED") return "rejected";
  if (err?.code === "INSUFFICIENT_FUNDS") return "funds";
  const msg = String(err?.message ?? e ?? "");
  if (/\b425\b|too early/i.test(msg)) return "TooEarlyError";
  if (/failed to fetch|networkerror|fetch failed|econnrefused|could not detect network|load failed|network error/i.test(msg)) return "network";
  if (err?.code === "NETWORK_ERROR" || err?.code === "SERVER_ERROR" || err?.code === "TIMEOUT") return "network";
  return "other";
}

const KNOWN_MESSAGES: Record<string, DictKey> = {
  NoNodeAccount: "err.NoNodeAccount",
  CentreNotInPackage: "err.CentreNotInPackage",
  BadBase32: "err.BadBase32",
};

function shortMessage(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string } | undefined;
  const m = String(err?.shortMessage ?? err?.message ?? e ?? "");
  return m.length > 240 ? m.slice(0, 240) + "..." : m;
}

/** Plain sentence for a failure; contract custom errors are named, e.g. KeyFrozen. */
export function explainError(e: unknown, t: TFn, cfg?: AppConfig): string {
  const rev = revertName(e, cfg);
  if (rev) return `${t(`err.${rev}` as DictKey)} (${rev})`;
  const msg = String((e as Error)?.message ?? "");
  if (msg in KNOWN_MESSAGES) return t(KNOWN_MESSAGES[msg]!);
  const kind = errorKind(e);
  switch (kind) {
    case "TooEarlyError":
      return t("err.TooEarlyError");
    case "WrongKeyError":
      return t("err.WrongKeyError");
    case "BadSignatureError":
      return t("err.BadSignatureError");
    case "network":
      return t("err.network");
    case "rejected":
      return t("err.rejected");
    case "funds":
      return t("err.funds");
    default:
      return t("err.generic", { msg: shortMessage(e) });
  }
}

/** True for failures that go away by waiting: round not served yet (TooEarly), relay or network down. */
export function isTransient(e: unknown): boolean {
  const k = errorKind(e);
  return k === "TooEarlyError" || k === "network";
}

/** Run fn until it succeeds or fails for good; transient failures are retried with a backoff of 1 s up to 15 s.
 *  Stops (rethrowing the last failure) once alive() is false. */
export async function retryTransient<T>(fn: () => Promise<T>, alive: () => boolean = () => true): Promise<T> {
  for (let delay = 1000; ; delay = Math.min(delay * 2, 15000)) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransient(e) || !alive()) throw e;
    }
    await new Promise((r) => setTimeout(r, delay));
  }
}
