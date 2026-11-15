import { INDIAN_STATES } from "../api/gst";

interface StateSelectProps {
  value: string; // "" => not set
  onChange: (code: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
}

export function StateSelect({ value, onChange, disabled, emptyLabel = "Not set" }: StateSelectProps) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">{emptyLabel}</option>
      {INDIAN_STATES.map((state) => (
        <option key={state.code} value={state.code}>
          {state.name} ({state.code})
        </option>
      ))}
    </select>
  );
}
