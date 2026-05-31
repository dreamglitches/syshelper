import { useState, useCallback } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

type Page = 'login' | 'dashboard';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');

  const onAuthRequired = useCallback(() => setPage('login'), []);
  const onLogin = useCallback(() => setPage('dashboard'), []);
  const onLogout = useCallback(() => setPage('login'), []);

  if (page === 'login') {
    return <Login onLogin={onLogin} />;
  }

  return (
    <Dashboard
      onAuthRequired={onAuthRequired}
      onLogout={onLogout}
    />
  );
}
