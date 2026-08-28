import { useState } from "react";
import { login } from "../api";
import type { Session } from "../auth";

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await login(email, password);
      if (!result.resolver.isAdmin) {
        setError("This account does not have admin access.");
        return;
      }
      onLoggedIn(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto" }} className="card">
      <form onSubmit={handleSubmit} style={{ padding: 24 }}>
        <h1 style={{ fontSize: 18, marginTop: 0 }}>Admin Console</h1>
        <p className="hint" style={{ marginBottom: 20, color: "var(--sub)", fontSize: 13 }}>
          Category tree, TAT policy, resolver/team mapping, and ops review.
        </p>

        {error && <div className="error-banner">{error}</div>}

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 14 }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 14 }}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: "100%" }}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
