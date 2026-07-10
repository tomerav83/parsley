interface StepListProps {
  steps: string[];
}

// Numbered method steps. The leading-zero mono numerals come from a CSS counter
// (.step-list, App.css) so the markup stays clean.
export function StepList({ steps }: StepListProps) {
  return (
    <ol className="step-list">
      {steps.map((step, index) => (
        <li key={index}>
          <p>{step}</p>
        </li>
      ))}
    </ol>
  );
}
