"use client";
// Demo moment: the office tries to slip a phantom centre in after the freeze. The chain refuses.
import { generateCentreKey, listRoot, recipientToBytes32 } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { useActor } from "@/lib/actor";
import { registry, sendTx } from "@/lib/chain";
import { explainError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import type { ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, ErrorBox, Notice, Section } from "../ui";

interface Attempt {
  label: string;
  refused: boolean;
  message: string;
}

export function PhantomDemo({ snap, onDone }: { snap: ExamSnapshot; onDone: () => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { wallet } = useActor();
  const act = useAction<Attempt[]>();

  const attempt = () =>
    act.run(async () => {
      if (!wallet) throw new Error(t("common.needWallet"));
      const c = registry(cfg, wallet);
      const phantom = cfg.demo.phantom;
      const out: Attempt[] = [];
      const ids = [...snap.centres.map((x) => x.centreId), phantom.centreId];
      // 1. Add the phantom to the exam's list (refreeze with one more centre).
      try {
        await sendTx(c, "freezeCentres", [snap.examId, ids, listRoot(ids), ids.length]);
        out.push({ label: t("phantom.addToList"), refused: false, message: t("phantom.accepted") });
      } catch (e) {
        out.push({ label: t("phantom.addToList"), refused: true, message: explainError(e, t, cfg) });
      }
      // 2. Swap the key of a listed centre for one the office holds.
      const target = snap.centres[0];
      if (target) {
        const k = await generateCentreKey();
        try {
          await sendTx(c, "registerCentre", [target.centreId, recipientToBytes32(k.recipient), wallet.address, target.name]);
          out.push({ label: t("phantom.swapKey", { name: target.name }), refused: false, message: t("phantom.accepted") });
        } catch (e) {
          out.push({ label: t("phantom.swapKey", { name: target.name }), refused: true, message: explainError(e, t, cfg) });
        }
      }
      onDone();
      return out;
    });

  return (
    <Section title={t("phantom.title")} id="phantom">
      <p>{t("phantom.body", { name: cfg.demo.phantom.name })}</p>
      {!snap.exam.frozen ? <Notice tone="warn">{t("phantom.needFrozen")}</Notice> : null}
      <Button variant="danger" onClick={() => void attempt()} busy={act.busy} disabled={!snap.exam.frozen} testId="phantom">
        {t("phantom.button")}
      </Button>
      <ErrorBox error={act.error} cfg={cfg} />
      {act.result ? (
        <ul className="list-unstyled mt-3 mb-0" data-testid="phantom-result">
          {act.result.map((a) => (
            <li key={a.label}>
              <Notice tone={a.refused ? "ok" : "error"}>
                <strong>{a.label} : </strong>
                {a.refused ? t("phantom.refused") : null} {a.message}
              </Notice>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
