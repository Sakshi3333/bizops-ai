import type { InvoiceStatus } from "../api/types";

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={`status-badge status-${status.toLowerCase()}`}>{status.toLowerCase()}</span>;
}
