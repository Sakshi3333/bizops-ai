import { useMemo, useState } from "react";
import type { MonthlyRevenue } from "../api/types";

const WIDTH = 760;
const HEIGHT = 280;
const PAD_LEFT = 56;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 32;
const BAR_RADIUS = 4;
const MAX_BAR_THICKNESS = 24;

function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, mon - 1, 1));
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit", timeZone: "UTC" });
}

function fullMonthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, mon - 1, 1));
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Round a scale max up to a "nice" step (1/2/5 x 10^n) so gridline labels
// are clean numbers, not e.g. 437.
function niceMax(value: number): number {
  if (value <= 0) return 100;
  const exponent = Math.floor(Math.log10(value));
  const base = Math.pow(10, exponent);
  const fraction = value / base;
  let niceFraction: number;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * base;
}

// Rounded top corners only; the baseline stays a sharp right angle so the
// bar visually sits flush on the zero line instead of looking lifted off it.
function topRoundedBarPath(x: number, yTop: number, width: number, yBottom: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, yBottom - yTop));
  if (r <= 0.5) {
    return `M ${x} ${yBottom} L ${x} ${yTop} L ${x + width} ${yTop} L ${x + width} ${yBottom} Z`;
  }
  return `M ${x} ${yBottom}
    L ${x} ${yTop + r}
    Q ${x} ${yTop} ${x + r} ${yTop}
    L ${x + width - r} ${yTop}
    Q ${x + width} ${yTop} ${x + width} ${yTop + r}
    L ${x + width} ${yBottom}
    Z`;
}

export function RevenueBarChart({ data }: { data: MonthlyRevenue[] }) {
  const [asTable, setAsTable] = useState(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const values = useMemo(() => data.map((d) => Number(d.paid_amount)), [data]);
  const scaleMax = useMemo(() => niceMax(Math.max(...values, 0)), [values]);

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slotWidth = plotWidth / Math.max(data.length, 1);
  const barWidth = Math.min(MAX_BAR_THICKNESS, slotWidth * 0.6);

  const gridSteps = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="revenue-chart">
      <div className="revenue-chart-header">
        <h3>Paid revenue, last 12 months</h3>
        <button type="button" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "View as chart" : "View as table"}
        </button>
      </div>

      {!asTable && (
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width={WIDTH}
          height={HEIGHT}
          role="img"
          aria-label="Paid revenue by month, last 12 months"
          className="revenue-chart-svg"
        >
          {gridSteps.map((step) => {
            const y = PAD_TOP + plotHeight * (1 - step);
            return (
              <g key={step}>
                <line
                  x1={PAD_LEFT}
                  x2={WIDTH - PAD_RIGHT}
                  y1={y}
                  y2={y}
                  stroke="var(--gridline)"
                  strokeWidth={1}
                />
                <text x={PAD_LEFT - 8} y={y} textAnchor="end" dominantBaseline="middle" className="chart-axis-label">
                  {formatCurrency(scaleMax * step)}
                </text>
              </g>
            );
          })}

          <line
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={PAD_TOP + plotHeight}
            y2={PAD_TOP + plotHeight}
            stroke="var(--axis)"
            strokeWidth={1}
          />

          {data.map((month, i) => {
            const value = values[i];
            const barHeight = scaleMax > 0 ? (value / scaleMax) * plotHeight : 0;
            const slotX = PAD_LEFT + i * slotWidth;
            const barX = slotX + (slotWidth - barWidth) / 2;
            const yTop = PAD_TOP + plotHeight - barHeight;
            const yBottom = PAD_TOP + plotHeight;
            const isHovered = hoverIndex === i;

            return (
              <g key={month.month}>
                <rect
                  x={slotX}
                  y={PAD_TOP}
                  width={slotWidth}
                  height={plotHeight}
                  fill="transparent"
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex((v) => (v === i ? null : v))}
                />
                <path
                  d={topRoundedBarPath(barX, yTop, barWidth, yBottom, BAR_RADIUS)}
                  fill="var(--chart-blue)"
                  opacity={isHovered ? 1 : 0.9}
                  pointerEvents="none"
                />
                <text
                  x={slotX + slotWidth / 2}
                  y={PAD_TOP + plotHeight + 18}
                  textAnchor="middle"
                  className="chart-axis-label"
                >
                  {monthLabel(month.month)}
                </text>
                {isHovered && (
                  <g pointerEvents="none">
                    <text
                      x={slotX + slotWidth / 2}
                      y={Math.max(PAD_TOP + 10, yTop - 8)}
                      textAnchor="middle"
                      className="chart-value-label"
                    >
                      {formatCurrency(value)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {asTable && (
        <table className="revenue-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Paid</th>
              <th>Invoiced</th>
            </tr>
          </thead>
          <tbody>
            {data.map((month) => (
              <tr key={month.month}>
                <td>{fullMonthLabel(month.month)}</td>
                <td>{Number(month.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td>{Number(month.invoiced_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
