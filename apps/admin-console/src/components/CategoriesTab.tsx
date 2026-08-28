import { useEffect, useState } from "react";
import { fetchCategoryTree, patchCategory, patchSubcategory } from "../api";
import { ALL_ROLES, type Department } from "../types";

export function CategoriesTab() {
  const [tree, setTree] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    fetchCategoryTree()
      .then(setTree)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function updateCategoryTat(categoryId: string, hours: number) {
    setSavingId(categoryId);
    try {
      await patchCategory(categoryId, { defaultTatHours: hours });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleConfidential(categoryId: string, current: boolean) {
    setSavingId(categoryId);
    try {
      await patchCategory(categoryId, { isConfidential: !current });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  async function toggleRole(subcategoryId: string, currentRoles: string[], role: string) {
    setSavingId(subcategoryId);
    const next = currentRoles.includes(role)
      ? currentRoles.filter((r) => r !== role)
      : [...currentRoles, role];
    try {
      await patchSubcategory(subcategoryId, { roleVisibility: next });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <div className="empty-state">Loading category tree…</div>;

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      <p className="hint" style={{ color: "var(--sub)", fontSize: 12, marginBottom: 16 }}>
        Click a role chip to toggle a subcategory's visibility for that role (ADR-008). An empty set means
        visible to everyone. TAT hours are editable inline (ADR-005). Real values pending department-head
        sign-off — see packages/db/src/categoryTaxonomy.ts.
      </p>

      {tree.map((dept) => (
        <div key={dept.id} className="dept-block card panel">
          <h3>{dept.name}</h3>
          {dept.categories.map((cat) => (
            <div key={cat.id} className="cat-row">
              <div className="cat-row-head">
                <span>{cat.name}</span>
                <span className="badge badge-blue">{cat.ticketType}</span>
                {cat.isConfidential && <span className="badge badge-purple">Confidential</span>}
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 400, fontSize: 12 }}>
                  TAT
                  <input
                    type="number"
                    defaultValue={cat.defaultTatHours}
                    disabled={savingId === cat.id}
                    onBlur={(e) => {
                      const val = Number(e.target.value);
                      if (val > 0 && val !== cat.defaultTatHours) updateCategoryTat(cat.id, val);
                    }}
                  />
                  h
                </label>
                <button
                  className="btn"
                  style={{ padding: "3px 8px", fontSize: 11 }}
                  disabled={savingId === cat.id}
                  onClick={() => toggleConfidential(cat.id, cat.isConfidential)}
                >
                  {cat.isConfidential ? "Unmark confidential" : "Mark confidential"}
                </button>
              </div>
              {cat.subcategories.map((sub) => (
                <div key={sub.id} className="subcat-row">
                  <span style={{ minWidth: 220 }}>{sub.name}</span>
                  {sub.roleVisibility.length === 0 && (
                    <span className="badge badge-accent" style={{ marginRight: 6 }}>
                      All roles
                    </span>
                  )}
                  <span>
                    {ALL_ROLES.map((role) => {
                      const on = sub.roleVisibility.includes(role);
                      return (
                        <span
                          key={role}
                          className={`role-chip${on ? "" : " off"}`}
                          onClick={() => toggleRole(sub.id, sub.roleVisibility, role)}
                          title={on ? `Visible to ${role} — click to hide` : `Hidden from ${role} — click to show`}
                        >
                          {role}
                        </span>
                      );
                    })}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
