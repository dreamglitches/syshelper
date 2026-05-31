import { useState, useEffect, FormEvent } from 'react';
import { getConfig, patchConfig, changePassword, AuthError, type Config } from '../api';

interface Props {
  config: Config;
  onAuthRequired: () => void;
  onSaved: (c: Config) => void;
}

export default function Settings({ config, onAuthRequired, onSaved }: Props) {
  const [form, setForm] = useState<Config>(config);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  useEffect(() => { setForm(config); }, [config]);

  function set<K extends keyof Config>(key: K, val: Config[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await patchConfig({
        idle_beacon_interval: form.idle_beacon_interval,
        action_expiry_hours: form.action_expiry_hours,
        upterm_server: form.upterm_server,
        operator_authorized_key: form.operator_authorized_key,
      });
      const updated = await getConfig();
      onSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      if (e instanceof AuthError) { onAuthRequired(); return; }
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    setPwSaving(true);
    setPwMsg('');
    setPwError('');
    try {
      await changePassword(newPassword);
      setNewPassword('');
      setPwMsg('Password updated successfully.');
    } catch (e) {
      if (e instanceof AuthError) { onAuthRequired(); return; }
      setPwError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="settings-panel">
      <h2>Settings</h2>

      <form onSubmit={handleSave}>
        {/* ── Polling ─────────────────────────────── */}
        <p className="settings-section-title">Polling</p>

        <div className="settings-row">
          <div className="input-group">
            <label className="input-label" htmlFor="beacon-interval">
              Beacon interval (seconds)
            </label>
            <input
              id="beacon-interval"
              type="number"
              className="input"
              min={50}
              value={form.idle_beacon_interval}
              onChange={e => set('idle_beacon_interval', parseInt(e.target.value) || 60)}
            />
            <p className="settings-hint">Minimum 50s. How often idle agents check in.</p>
          </div>
        </div>

        <div className="settings-row" style={{ marginTop: 12 }}>
          <div className="input-group">
            <label className="input-label" htmlFor="action-expiry">
              Action expiry (hours)
            </label>
            <input
              id="action-expiry"
              type="number"
              className="input"
              min={1}
              value={form.action_expiry_hours}
              onChange={e => set('action_expiry_hours', parseInt(e.target.value) || 24)}
            />
            <p className="settings-hint">Unexecuted actions are marked failed after this time.</p>
          </div>
        </div>

        <div className="divider" />

        {/* ── upterm ──────────────────────────────── */}
        <p className="settings-section-title">upterm</p>

        <div className="settings-row">
          <div className="input-group">
            <label className="input-label" htmlFor="upterm-server">
              upterm server URL
            </label>
            <input
              id="upterm-server"
              type="text"
              className="input"
              value={form.upterm_server}
              onChange={e => set('upterm_server', e.target.value)}
              placeholder="ssh://uptermd.upterm.dev:22"
            />
          </div>
        </div>

        <div className="settings-row" style={{ marginTop: 12 }}>
          <div className="input-group">
            <label className="input-label" htmlFor="operator-key">
              Operator authorized key
            </label>
            <textarea
              id="operator-key"
              className="textarea"
              value={form.operator_authorized_key}
              onChange={e => set('operator_authorized_key', e.target.value)}
              placeholder="ssh-ed25519 AAAA..."
              rows={3}
            />
            <p className="settings-hint">
              Your SSH public key (e.g. <code>~/.ssh/id_ed25519.pub</code>).
              Leave empty to block all connect attempts.
            </p>
          </div>
        </div>

        <div className="divider" />

        {error && (
          <div style={{
            background: 'var(--red-dim)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            fontSize: '0.8125rem',
            color: 'var(--red)',
            marginBottom: 12,
          }}>
            {error}
          </div>
        )}

        <button
          id="settings-save-btn"
          type="submit"
          className={`btn w-full ${saved ? 'btn-success' : 'btn-primary'}`}
          disabled={saving}
          style={{ justifyContent: 'center' }}
        >
          {saving ? <span className="spinner" /> : saved ? '✓ Saved' : 'Save changes'}
        </button>
      </form>

      <div className="divider" />

      {/* ── Password ────────────────────────────── */}
      <div>
        <p className="settings-section-title">Web Password</p>
        <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="input-group">
            <label className="input-label" htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              className="input"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters"
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          {pwMsg && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--green)' }}>{pwMsg}</p>
          )}
          {pwError && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--red)' }}>{pwError}</p>
          )}

          <button
            id="change-password-btn"
            type="submit"
            className="btn btn-ghost w-full"
            disabled={pwSaving || newPassword.length < 8}
            style={{ justifyContent: 'center' }}
          >
            {pwSaving ? <span className="spinner" /> : 'Update password'}
          </button>
        </form>
        <p className="settings-hint" style={{ marginTop: 8 }}>
          Emergency recovery: use <code>/resetpassword</code> via Telegram.
        </p>
      </div>
    </div>
  );
}
