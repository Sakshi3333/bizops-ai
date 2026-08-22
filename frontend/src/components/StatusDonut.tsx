import type { InvoiceStatus, StatusCount } from "../api/types";

const RADIUS = 70;
const STROKE = 22;
const SIZE = (RADIUS + STROKE) * 2;
const GAP = 3;

// Status colors are reserved (good/warning/serious/critical), never reused
// for arbitrary series identity. DRAFT isn't a "state of concern" so it
// gets the neutral muted ink instead of a status color.
const STATUS_COLOR: Record<InvoiceStatus, string> = {
  DRAFT: "var(--muted)",
  SENT: "var(--status-warning)",
  PAID: "var(--status-good)",
  CANCELLED: "var(--status-critical)",
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

const ORDER: InvoiceStatus[] = ["PAID", "SENT", "DRAFT", "CANCELLED"];

export function StatusDonut({ data }: { data: StatusCount[] }) {
  const countByStatus = Object.fromEntries(data.map((d) => [d.status, d.count])) as Record<
    InvoiceStatus,
    number
  >;
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const circumference = 2 * Math.PI * RADIUS;

  let cumulative = 0;
  const segments = ORDER.map((status) => {
    const value = countByStatus[status] ?? 0;
    const fraction = total > 0 ? value / total : 0;
    const trueLength = fraction * circumference;
    const drawLength = Math.max(trueLength - GAP, 0);
    const offset = -cumulative;
    cumulative += trueLength;
    return { status, value, drawLength, offset };
  });

  return (
    <div className="status-donut">
      <h3>Invoices by status</h3>
      <div className="status-donut-body">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="Invoices by status">
          {total === 0 ? (
            <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--gridline)" strokeWidth={STROKE} />
          ) : (
            segments.map(
              (seg) =>
                seg.value > 0 && (
                  <circle
                    key={seg.status}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={STATUS_COLOR[seg.status]}
                    strokeWidth={STROKE}
                    strokeDasharray={`${seg.drawLength} ${circumference - seg.drawLength}`}
                    strokeDashoffset={seg.offset}
                    transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                  />
                ),
            )
          )}
          <text x={SIZE / 2} y={SIZE / 2 - 6} textAnchor="middle" className="donut-total-value">
            {total}
          </text>
          <text x={SIZE / 2} y={SIZE / 2 + 14} textAnchor="middle" className="chart-axis-label">
            invoices
          </text>
        </svg>

        <ul className="status-legend">
          {ORDER.map((status) => (
            <li key={status}>
              <span className="status-legend-swatch" style={{ background: STATUS_COLOR[status] }} />
              <span className="status-legend-label">{STATUS_LABEL[status]}</span>
              <span className="status-legend-count">{countByStatus[status] ?? 0}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
