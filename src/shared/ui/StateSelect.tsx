import { stateOptions } from "../../features/catalog/geography";
export function StateSelect({
  id,
  value,
  onChange,
  includeDC = false,
  className = "",
  label = "Select state for Best in State and My List filtering",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  includeDC?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <select
      id={id}
      className={className}
      aria-label={label}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      <option value="">Select a state…</option>
      {stateOptions
        .filter((state) => includeDC || state.code !== "DC")
        .map((state) => (
          <option key={state.code} value={state.code}>
            {state.name}
          </option>
        ))}
    </select>
  );
}
