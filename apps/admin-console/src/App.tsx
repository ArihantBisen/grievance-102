import { useState } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { CategoriesTab } from "./components/CategoriesTab";
import { TeamsTab } from "./components/TeamsTab";
import { IdentitiesTab } from "./components/IdentitiesTab";
import { OpsTab } from "./components/OpsTab";
import { ReportsTab } from "./components/ReportsTab";
import { clearSession, loadSession, saveSession, type Session } from "./auth";

type Tab = "categories" | "teams" | "identities" | "ops" | "reports";

const TABS: { key: Tab; label: string }[] = [
  { key: "categories", label: "Category Tree" },
  { key: "teams", label: "Resolvers & Teams" },
  { key: "identities", label: "Identities" },
  { key: "ops", label: "Ops" },
  { key: "reports", label: "Reports" },
];

export function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [tab, setTab] = useState<Tab>("categories");

  function handleLogout() {
    clearSession();
    setSession(null);
  }

  if (!session) {
    return (
      <LoginScreen
        onLoggedIn={(s) => {
          saveSession(s);
          setSession(s);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <h1>Admin Console</h1>
        <div className="session-picker">
          <span style={{ fontSize: 13 }}>{session.resolver.name}</span>
          <button className="btn" onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "categories" && <CategoriesTab />}
      {tab === "teams" && <TeamsTab />}
      {tab === "identities" && <IdentitiesTab />}
      {tab === "ops" && <OpsTab />}
      {tab === "reports" && <ReportsTab />}
    </div>
  );
}
