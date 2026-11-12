import { useEffect, useState } from 'react';
import type { AuthUser } from '../shared/types.ts';
import { getSession } from './api/client.ts';
import { HubDashboard } from './components/HubDashboard.tsx';
import { LoginForm } from './components/LoginForm.tsx';

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    getSession()
      .then((res) => {
        if (active) setUser(res.authenticated ? res.user : null);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return (
      <main className="auth-shell">
        <p style={{ color: 'var(--text-muted)' }}>Đang kiểm tra phiên đăng nhập...</p>
      </main>
    );
  }

  if (!user) {
    return <LoginForm onSuccess={(loggedInUser) => setUser(loggedInUser)} />;
  }

  return <HubDashboard user={user} onUnauthorized={() => setUser(null)} />;
}

