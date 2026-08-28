function computeStatus(createdAt: string, tatDueAt: string, breached: boolean): "green" | "amber" | "red" {
  if (breached) return "red";
  const now = Date.now();
  const due = new Date(tatDueAt).getTime();
  const created = new Date(createdAt).getTime();
  if (now >= due) return "red";
  const total = due - created;
  const remaining = due - now;
  if (total > 0 && remaining / total < 0.25) return "amber";
  return "green";
}

export function SlaIndicator({
  createdAt,
  tatDueAt,
  breached,
}: {
  createdAt: string;
  tatDueAt: string;
  breached: boolean;
}) {
  const status = computeStatus(createdAt, tatDueAt, breached);
  const label =
    status === "red"
      ? breached
        ? "Breached"
        : "Overdue"
      : status === "amber"
        ? "TAT approaching"
        : "On track";
  return (
    <span title={new Date(tatDueAt).toLocaleString()}>
      <span className={`sla-dot sla-dot-${status}`} />
      {label}
    </span>
  );
}
