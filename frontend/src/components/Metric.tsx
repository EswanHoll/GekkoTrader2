import { formatMoney } from "@/lib/format";

type Props = {
  label: string;
  value: unknown;
  testId: string;
  money?: boolean;
  signed?: boolean;
  chip?: string;
  raw?: string;
};

export function Metric({
  label,
  value,
  testId,
  money,
  signed,
  chip,
  raw,
}: Props) {
  const n = Number(value);
  const text =
    raw != null
      ? raw
      : money
        ? formatMoney(value, { signed })
        : value == null || value === ""
          ? "—"
          : String(value);
  const tone =
    money && Number.isFinite(n)
      ? n > 0
        ? "text-gekko"
        : n < 0
          ? "text-red-400"
          : ""
      : "";

  return (
    <div
      className="rounded-lg border border-gekko-border bg-gekko-surface/50 px-3 py-3"
      data-testid={testId}
    >
      <div className="text-xs uppercase tracking-wide text-gekko-muted">
        {label}
      </div>
      <div className={`mt-1 font-mono text-lg font-bold ${tone}`}>{text}</div>
      {chip ? (
        <div className="mt-1 text-xs text-gekko-muted" data-testid={`${testId}-chip`}>
          {chip}
        </div>
      ) : null}
    </div>
  );
}
