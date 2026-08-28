import { useEffect, useState } from "react";
import { createResolver, fetchResolvers, fetchTeams, patchResolver } from "../api";
import type { Resolver, Team } from "../types";

export function TeamsTab() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [resolvers, setResolvers] = useState<Resolver[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [teamId, setTeamId] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  function refresh() {
    Promise.all([fetchTeams(), fetchResolvers()])
      .then(([t, r]) => {
        setTeams(t);
        setResolvers(r);
      })
      .catch((e) => setError(e.message));
  }

  useEffect(refresh, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createResolver({ name, email, teamId, password, isAdmin: false });
      setName("");
      setEmail("");
      setTeamId("");
      setPassword("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function reassignTeam(resolverId: string, newTeamId: string) {
    try {
      await patchResolver(resolverId, { teamId: newTeamId });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function toggleAdmin(resolverId: string, current: boolean) {
    try {
      await patchResolver(resolverId, { isAdmin: !current });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card panel">
        <h2>Add a resolver</h2>
        <form className="inline-form" onSubmit={handleCreate}>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
            <option value="">Team…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Initial password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? "Adding…" : "Add resolver"}
          </button>
        </form>
      </div>

      <div className="card panel">
        <h2>Resolvers</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Team</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>
            {resolvers.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="mono" style={{ fontSize: 12 }}>{r.email}</td>
                <td>
                  <select value={r.teamId} onChange={(e) => reassignTeam(r.id, e.target.value)}>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => toggleAdmin(r.id, r.isAdmin)}>
                    {r.isAdmin ? "Revoke admin" : "Grant admin"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card panel">
        <h2>Teams</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Department</th>
              <th>Confidential</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.department?.name}</td>
                <td>{t.isConfidential ? <span className="badge badge-purple">Yes</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
