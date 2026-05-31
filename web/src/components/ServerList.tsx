import type { Server } from '../api';
import ServerCard from './ServerCard';

interface Props {
  servers: Server[];
  onAuthRequired: () => void;
  onRefresh: () => void;
}

export default function ServerList({ servers, onAuthRequired, onRefresh }: Props) {
  if (servers.length === 0) {
    return (
      <div className="server-list-empty">
        <div className="empty-icon">🖥</div>
        <h2>No servers yet</h2>
        <p className="text-muted text-sm">
          Install the syshelper agent on a Linux server to get started.
        </p>
        <code className="mono" style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 16px',
          color: 'var(--text-mono)',
          fontSize: '0.8125rem',
        }}>
          curl -fsSL https://your-pages.dev/install.sh | bash
        </code>
      </div>
    );
  }

  // Sort: online first, then by last_seen desc
  const sorted = [...servers].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return b.last_seen - a.last_seen;
  });

  return (
    <div>
      <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 600 }}>Servers</h1>
        <span className="badge badge-count">{servers.length}</span>
      </div>
      <div className="server-list">
        {sorted.map(server => (
          <ServerCard
            key={server.machine_id}
            server={server}
            onAuthRequired={onAuthRequired}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </div>
  );
}
