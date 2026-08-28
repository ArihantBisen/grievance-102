import { useEffect, useState } from "react";
import { fetchIdentities, patchIdentityRole } from "../api";
import { ALL_ROLES, type Identity } from "../types";

export function IdentitiesTab() {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    fetchIdentities({ role: roleFilter || undefined, employmentStatus: statusFilter || undefined, search: search || undefined })
      .then(setIdentities)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [roleFilter, statusFilter, search]);

  async function overrideRole(id: string, role: string) {
    try {
      await patchIdentityRole(id, role);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="card panel">
      <h2>Identities</h2>
      <p className="hint" style={{ color: "var(--sub)", fontSize: 12, marginBottom: 12 }}>
        Workline's sync job classifies role from designation (D2a); override here for edge cases the
        classifier misses. An override is preserved across future syncs (roleClassifiedBy = "admin").
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="filter-bar">
        <input placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      {loading && <div className="empty-state">Loading…</div>}
      {!loading && identities.length === 0 && <div className="empty-state">No identities match.</div>}

      {!loading && identities.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>External ID</th>
              <th>Designation</th>
              <th>Status</th>
              <th>Role</th>
              <th>Classified by</th>
            </tr>
          </thead>
          <tbody>
            {identities.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td className="mono" style={{ fontSize: 12 }}>{i.externalId}</td>
                <td>{i.designation ?? "—"}</td>
                <td>
                  {i.employmentStatus === "ACTIVE" ? (
                    <span className="badge badge-accent">Active</span>
                  ) : (
                    <span className="badge badge-red">Inactive</span>
                  )}
                </td>
                <td>
                  <select value={i.role} onChange={(e) => overrideRole(i.id, e.target.value)}>
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{i.roleClassifiedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
