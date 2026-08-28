export interface AdminResolver {
  id: string;
  name: string;
  email: string;
  teamId: string;
  isAdmin: boolean;
}

export interface Session {
  token: string;
  resolver: AdminResolver;
}

const STORAGE_KEY = "sboss_admin_session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* per-viewer convenience only */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
