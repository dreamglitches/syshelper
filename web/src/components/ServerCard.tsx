import { useState, useCallback } from 'react';
import { queueAction, AuthError, type Server } from '../api';
import SessionPanel from './SessionPanel';

interface Props {
  server: Server;
  onAuthRequired: () => void;
  onRefresh: () => void;
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ServerCard({ server, onAuthRequired, onRefresh }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const action = useCallback(async (type: 'get_link' | 'kill' | 'recreate') => {
    setLoading(type);
    setError('');
    try {
      await queueAction(server.machine_id, type);
      onRefresh();
    } catch (e) {
      if (e instanceof AuthError) { onAuthRequired(); return; }
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(null);
    }
  }, [server.machine_id, onAuthRequired, onRefresh]);

  const isConnecting = server.status === 'connecting';
  const isActive = server.status === 'active';

  return (
    <div className={`card server-card${isActive ? ' active-session' : ''}`}>
      {/* Header */}
      <div className="server-card-header">
        <div
          className={`dot ${server.online ? 'dot-online' : 'dot-offline'}`}
          style={{ marginTop: 6 }}
          title={server.online ? 'Online' : 'Offline'}
        />
        <div className="server-card-meta">
          <div className="server-card-hostname" title={server.hostname}>
            {server.hostname}
          </div>
          <div className="server-card-id mono">{server.machine_id.slice(0, 8)}…</div>
        </div>
        <div className="flex flex-col items-center gap-2" style={{ alignItems: 'flex-end' }}>
          <div className="server-card-badges">
            <span className={`badge ${server.online ? 'badge-online' : 'badge-offline'}`}>
              {server.online ? 'Online' : 'Offline'}
            </span>
            <span className={`badge ${
              isActive ? 'badge-active' :
              isConnecting ? 'badge-connecting connecting-pulse' :
              'badge-idle'
            }`}>
              {isActive ? '📡 Active' : isConnecting ? '⏳ Connecting' : 'Idle'}
            </span>
          </div>
          {server.agent_version && (
            <span className="server-card-version">v{server.agent_version}</span>
          )}
        </div>
      </div>

      {/* Active session panel */}
      {isActive && server.link && (
        <SessionPanel
          link={server.link}
          createdAt={server.session_created_at ?? Date.now()}
        />
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: 'var(--red-dim)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 12px',
          fontSize: '0.75rem',
          color: 'var(--red)',
        }}>
          {error}
        </div>
      )}

      {/* Footer */}
      <div className="server-card-footer">
        <span className="server-card-lastseen">
          Last seen {relativeTime(server.last_seen)}
        </span>
        <div className="server-actions">
          <button
            id={`connect-${server.machine_id.slice(0, 8)}`}
            className="btn btn-success btn-sm"
            onClick={() => action('get_link')}
            disabled={loading !== null || isConnecting}
            title="Open a terminal session"
          >
            {loading === 'get_link' ? <span className="spinner" /> : '⚡ Connect'}
          </button>
          <button
            id={`recreate-${server.machine_id.slice(0, 8)}`}
            className="btn btn-ghost btn-sm"
            onClick={() => action('recreate')}
            disabled={loading !== null}
            title="Kill and reconnect"
          >
            {loading === 'recreate' ? <span className="spinner" /> : '↺ Recreate'}
          </button>
          <button
            id={`kill-${server.machine_id.slice(0, 8)}`}
            className="btn btn-danger btn-sm"
            onClick={() => action('kill')}
            disabled={loading !== null || (!isActive && !isConnecting)}
            title="Kill session"
          >
            {loading === 'kill' ? <span className="spinner" /> : '✕ Kill'}
          </button>
        </div>
      </div>
    </div>
  );
}
