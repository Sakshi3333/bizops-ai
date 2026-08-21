import { isAxiosError } from "axios";

export function extractErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) => (typeof d?.msg === "string" ? d.msg : JSON.stringify(d)))
        .join("; ");
    }
    if (err.message) return err.message;
  }
  return "Something went wrong. Please try again.";
}
