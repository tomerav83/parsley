import type { Recipe } from "../api";

interface TimingRowProps {
  recipe: Recipe;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}` : `${hours}h`;
}

interface Cell {
  label: string;
  value: string;
}

function buildCells(recipe: Recipe): Cell[] {
  const cells: Cell[] = [];
  if (recipe.prep_time_minutes)
    cells.push({
      label: "Prep",
      value: formatMinutes(recipe.prep_time_minutes),
    });
  if (recipe.cook_time_minutes)
    cells.push({
      label: "Cook",
      value: formatMinutes(recipe.cook_time_minutes),
    });
  if (recipe.total_time_minutes)
    cells.push({
      label: "Total",
      value: formatMinutes(recipe.total_time_minutes),
    });
  if (recipe.yields) cells.push({ label: "Yield", value: recipe.yields });
  return cells;
}

// The timing strip, pinned under the title. Specimen-style (direction B): hairline
// dividers, mono uppercase labels, tabular figures. Renders nothing if no timings.
export function TimingRow({ recipe }: TimingRowProps) {
  const cells = buildCells(recipe);
  if (cells.length === 0) return null;

  return (
    <dl className="timing">
      {cells.map((cell) => (
        <div key={cell.label}>
          <dt>{cell.label}</dt>
          <dd>{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
