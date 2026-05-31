import { useState, useEffect, useCallback, useRef } from 'react';
import { getServers, getConfig, logout as apiLogout, AuthError, type Server, type Config } from '../api';
import ServerList from '../components/ServerList';
import Settings from '../components/Settings';

interface Props {
  onAuthRequired: () => void;
  onLogout: () => void;
}

const REFRESH_INTERVAL = 30; // seconds

export default function Dashboard({ onAuthRequired, onLogout }: Props) {
  const [servers, setServers] = useState<Server[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [s, c] = await Promise.all([getServers(), getConfig()]);
      setServers(s);
      setConfig(c);
    } catch (e) {
      if (e instanceof AuthError) { onAuthRequired(); return; }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setCountdown(REFRESH_INTERVAL);
    }
  }, [onAuthRequired]);

  // Initial load
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 30s
  useEffect(() => {
    refreshRef.current = setInterval(() => fetchAll(true), REFRESH_INTERVAL * 1000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [fetchAll]);

  // Countdown ticker
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(c => (c <= 1 ? REFRESH_INTERVAL : c - 1));
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  async function handleLogout() {
    await apiLogout();
    onLogout();
  }

  function handleManualRefresh() {
    // Reset auto-refresh timer
    if (refreshRef.current) clearInterval(refreshRef.current);
    refreshRef.current = setInterval(() => fetchAll(true), REFRESH_INTERVAL * 1000);
    fetchAll(true);
  }

  const onlineCount = servers.filter(s => s.online).length;
  const activeCount = servers.filter(s => s.status === 'active').length;

  return (
    <div className="app">
      {/* Navbar */}
      <nav className="navbar">
        <span className="navbar-brand">⚡ Syshelper</span>

        <div className="flex items-center gap-2" style={{ marginLeft: 12 }}>
          {onlineCount > 0 && (
            <span className="badge badge-count">{onlineCount} online</span>
          )}
          {activeCount > 0 && (
            <span className="badge badge-active">📡 {activeCount} active</span>
          )}
        </div>

        <div className="navbar-spacer" />

        <span className="refresh-countdown" title="Next auto-refresh">
          {refreshing ? (
            <span className="spinner" style={{ width: 12, height: 12 }} />
          ) : (
            `${countdown}s`
          )}
        </span>

        <button
          id="refresh-btn"
          className="btn btn-ghost btn-sm"
          onClick={handleManualRefresh}
          disabled={refreshing}
          title="Refresh now"
        >
          ↻
        </button>

        <button
          id="settings-toggle-btn"
          className="btn btn-ghost btn-sm"
          onClick={() => setSettingsOpen(o => !o)}
          title="Settings"
        >
          ⚙
        </button>

        <button
          id="logout-btn"
          className="btn btn-ghost btn-sm"
          onClick={handleLogout}
          title="Sign out"
        >
          Sign out
        </button>
      </nav>

      {/* Body */}
      <div className="main-layout">
        <div className="content-area">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
              <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            </div>
          ) : (
            <ServerList
              servers={servers}
              onAuthRequired={onAuthRequired}
              onRefresh={() => fetchAll(true)}
            />
          )}
        </div>

        <aside className={`sidebar${settingsOpen ? '' : ' collapsed'}`}>
          {settingsOpen && config && (
            <Settings
              config={config}
              onAuthRequired={onAuthRequired}
              onSaved={c => setConfig(c)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
