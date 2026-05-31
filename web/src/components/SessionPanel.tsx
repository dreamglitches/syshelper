import { useState } from 'react';

interface Props {
  link: string;
  createdAt: number;
}

function sessionAge(ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export default function SessionPanel({ link, createdAt }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
    }
  }

  return (
    <div className="session-panel">
      <div className="session-panel-header">
        <span className="session-panel-title">📡 Active Session</span>
        <span className="session-panel-age">Active {sessionAge(createdAt)}</span>
      </div>

      <div className="session-link-row">
        <span className="session-link mono" title={link}>{link}</span>
        <button
          id="copy-session-link"
          className={`btn btn-ghost btn-sm copy-btn${copied ? ' copied' : ''}`}
          onClick={handleCopy}
          title="Copy SSH command"
        >
          {copied ? '✓ Copied' : '⎘ Copy'}
        </button>
      </div>

      <p className="settings-hint">
        Run the command above in your terminal to open a remote shell.
      </p>
    </div>
  );
}
