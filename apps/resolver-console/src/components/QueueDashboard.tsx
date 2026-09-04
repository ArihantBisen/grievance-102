import type { QueueBucket, QueueSummary } from "../types";

// The four counts a resolver actually works from, each one a filter. Clicking a tile
// narrows the queue beside it rather than navigating away — the numbers and the list
// are the same view at two zoom levels, so there's nowhere to "go back" from.
const TILES: { key: QueueBucket; label: string }[] = [
  { key: "new", label: "New" },
  { key: "inProgress", label: "In Progress" },
  { key: "closed", label: "Closed" },
  { key: "reopened", label: "Reopened" },
];

interface Props {
  summary: QueueSummary | null;
  active: QueueBucket | "";
  onSelect: (bucket: QueueBucket | "") => void;
}

export function QueueDashboard({ summary, active, onSelect }: Props) {
  return (
    <div className="queue-dashboard">
      {TILES.map((tile) => {
        const isActive = active === tile.key;
        return (
          <button
            key={tile.key}
            type="button"
            className={`dash-tile${isActive ? " active" : ""}`}
            aria-pressed={isActive}
            // Clicking the active tile clears the filter, so the tile doubles as its
            // own "show everything again" control.
            onClick={() => onSelect(isActive ? "" : tile.key)}
          >
            <span className="dash-tile-value">{summary ? summary[tile.key] : "—"}</span>
            <span className="dash-tile-label">{tile.label}</span>
          </button>
        );
      })}
      {summary && summary.breached > 0 && (
        <div className="dash-tile dash-tile-alert" aria-live="polite">
          <span className="dash-tile-value">{summary.breached}</span>
          <span className="dash-tile-label">TAT Breached</span>
        </div>
      )}
    </div>
  );
}
