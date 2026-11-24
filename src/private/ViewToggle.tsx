import { Button } from "../components/ui/button";
export function ViewToggle<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="view-toggle">
      {options.map((option) => (
        <Button
          type="button"
          key={option}
          aria-pressed={option === value}
          variant={option === value ? "default" : "outline"}
          onClick={() => onChange(option)}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}
