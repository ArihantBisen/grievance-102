const STEP_LABELS = ["Grievance Details", "Supporting Documents", "Review"];

export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="steps">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1;
        const cls =
          stepNum === current ? "step-pill active" : stepNum < current ? "step-pill done" : "step-pill";
        return (
          <div key={label} className={cls}>
            {stepNum}. {label}
          </div>
        );
      })}
    </div>
  );
}
