// Brand bar for the citizen-facing portal. Rendered once in main.tsx above <App />
// rather than inside App's own render branches, since App returns early in five
// different states (no link, error, loading, confirmation, form) and every one of
// them should sit under the same header.
export function PortalHeader() {
  return (
    <header className="portal-header">
      <div className="portal-header-inner">
        <span className="brand">SBOSS</span>
        <span className="brand-sub">Grievance Portal</span>
      </div>
    </header>
  );
}
