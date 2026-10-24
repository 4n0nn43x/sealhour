"use client";
// Every centre registered on chain: name, key (short), operator, frozen.
import { useI18n } from "@/lib/i18n";
import type { CentreInfo } from "@/lib/registry";
import { Chip, Hex } from "../ui";

export function CentresTable({
  centres,
  selectable,
  selected,
  onToggle,
}: {
  centres: CentreInfo[];
  selectable?: boolean;
  selected?: string[];
  onToggle?: (id: string) => void;
}) {
  const { t } = useI18n();
  if (centres.length === 0) return <p className="text-muted">{t("enrol.noCentres")}</p>;
  return (
    <div className="table-responsive">
      <table className="table table-sm table-hover align-middle mb-0" data-testid="centres-table">
        <thead className="table-light">
          <tr>
            {selectable ? <th scope="col">{t("enrol.pick")}</th> : null}
            <th scope="col">{t("common.name")}</th>
            <th scope="col">{t("common.key")}</th>
            <th scope="col">{t("common.operator")}</th>
            <th scope="col">{t("common.status")}</th>
          </tr>
        </thead>
        <tbody>
          {centres.map((c) => (
            <tr key={c.centreId}>
              {selectable ? (
                <td>
                  <input
                    className="form-check-input"
                    type="checkbox"
                    aria-label={c.name}
                    checked={selected?.includes(c.centreId) ?? false}
                    onChange={() => onToggle?.(c.centreId)}
                  />
                </td>
              ) : null}
              <td>
                {c.name || <span className="text-muted">-</span>}
                <div className="small">
                  <Hex value={c.centreId} />
                </div>
              </td>
              <td>
                <code className="hex" title={c.recipient ?? c.pubKey}>
                  {c.recipient ? `${c.recipient.slice(0, 12)}...${c.recipient.slice(-6)}` : "-"}
                </code>
              </td>
              <td>
                <Hex value={c.operator} />
              </td>
              <td>
                <Chip ok={c.frozen ? true : null}>{c.frozen ? t("enrol.frozen") : t("enrol.notFrozen")}</Chip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
