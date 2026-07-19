import type { Recipe } from "@/lib/api";
import styles from "./TimingRow.module.css";

interface TimingRowProps {
  recipe: Recipe;
  // "strip" = hairline specimen row (default, used when there's no photo).
  // "chips" = pill row that reads over the hero image banner.
  variant?: "strip" | "chips";
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}` : `${hours}h`;
}

// The timing strip, pinned under the title. Specimen-style (direction B): hairline
// dividers, mono uppercase labels, tabular figures. Renders nothing if no timings.
export function TimingRow({ recipe, variant = "strip" }: TimingRowProps) {
  const cells = (
    [
      ["Prep", recipe.prep_time_minutes],
      ["Cook", recipe.cook_time_minutes],
      ["Total", recipe.total_time_minutes],
      ["Yield", recipe.yields],
    ] as const
  )
    .filter(([, value]) => value)
    .map(([label, value]) => ({
      label,
      value: typeof value === "number" ? formatMinutes(value) : value,
    }));
  if (cells.length === 0) return null;

  const isChips = variant === "chips";
  return (
    <dl className={isChips ? styles.chips : styles.strip}>
      {cells.map((cell) => (
        <div key={cell.label} className={isChips ? styles.chip : undefined}>
          <dt>{cell.label}</dt>
          <dd>{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
