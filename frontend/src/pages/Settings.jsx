import { useState, useEffect } from 'react';
import { Server, Plus, Trash2, Edit2, Clock, Tv, ExternalLink, Copy, Check, RefreshCw, Unlink } from 'lucide-react';

export default function Settings() {
  const [servers, setServers] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [serverType, setServerType] = useState('emby');
  const [apiKey, setApiKey] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [editingId, setEditingId] = useState(null);
  
  // Sync Settings State
  const [syncInterval, setSyncInterval] = useState(1);
  const [savingInterval, setSavingInterval] = useState(false);

  // Trakt State
  const [traktStatus, setTraktStatus] = useState({ connected: false, username: null });
  const [deviceAuth, setDeviceAuth] = useState(null);
  const [traktLoading, setTraktLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [pollStatus, setPollStatus] = useState('');

  // SIMKL State
  const [simklStatus, setSimklStatus] = useState({ connected: false, username: null });
  const [simklDeviceAuth, setSimklDeviceAuth] = useState(null);
  const [simklLoading, setSimklLoading] = useState(false);
  const [simklCopySuccess, setSimklCopySuccess] = useState(false);
  const [simklPollStatus, setSimklPollStatus] = useState('');

  const fetchServers = async () => {
    try {
      const resp = await fetch('/api/settings/servers', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('isAdmin');
        window.location.href = '/login';
        return;
      }
      if (resp.ok) setServers(await resp.json());
      
      const intResp = await fetch('/api/settings/sync-interval', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (intResp.ok) {
        const data = await intResp.json();
        setSyncInterval(data.interval_hours);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTraktStatus = async () => {
    try {
      const resp = await fetch('/api/settings/trakt/status', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setTraktStatus(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSimklStatus = async () => {
    try {
      const resp = await fetch('/api/settings/simkl/status', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setSimklStatus(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchServers();
    fetchTraktStatus();
    fetchSimklStatus();
  }, []);

  // Poll Trakt Device Token when deviceAuth is active
  useEffect(() => {
    if (!deviceAuth?.device_code) return;
    
    const interval = Math.max((deviceAuth.interval || 5), 5) * 1000;
    const timer = setInterval(async () => {
      try {
        const resp = await fetch('/api/settings/trakt/poll-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ device_code: deviceAuth.device_code })
        });
        const data = await resp.json();
        if (data.status === 'authorized') {
          setDeviceAuth(null);
          setTraktStatus({ connected: true, username: data.username });
          setPollStatus('');
          clearInterval(timer);
        } else if (data.status === 'expired') {
          setPollStatus('Activation code expired. Please request a new code.');
          clearInterval(timer);
        }
      } catch (err) {
        console.error('Trakt polling error:', err);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [deviceAuth]);

  // Poll SIMKL PIN when simklDeviceAuth is active
  useEffect(() => {
    if (!simklDeviceAuth?.user_code) return;

    const interval = Math.max((simklDeviceAuth.interval || 5), 5) * 1000;
    const timer = setInterval(async () => {
      try {
        const resp = await fetch('/api/settings/simkl/poll-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ user_code: simklDeviceAuth.user_code })
        });
        const data = await resp.json();
        if (data.status === 'authorized') {
          setSimklDeviceAuth(null);
          setSimklStatus({ connected: true, username: data.username });
          setSimklPollStatus('');
          clearInterval(timer);
        }
      } catch (err) {
        console.error('SIMKL polling error:', err);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [simklDeviceAuth]);

  const handleStartTraktAuth = async () => {
    setTraktLoading(true);
    setPollStatus('');
    try {
      const resp = await fetch('/api/settings/trakt/device-code', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || 'Failed to request device code');
      }
      const data = await resp.json();
      setDeviceAuth(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setTraktLoading(false);
    }
  };

  const handleDisconnectTrakt = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Trakt account?')) return;
    try {
      const resp = await fetch('/api/settings/trakt/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.ok) {
        setTraktStatus({ connected: false, username: null });
        setDeviceAuth(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartSimklAuth = async () => {
    setSimklLoading(true);
    setSimklPollStatus('');
    try {
      const resp = await fetch('/api/settings/simkl/pin', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || 'Failed to request SIMKL PIN');
      }
      const data = await resp.json();
      setSimklDeviceAuth(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setSimklLoading(false);
    }
  };

  const handleDisconnectSimkl = async () => {
    if (!window.confirm('Are you sure you want to disconnect your SIMKL account?')) return;
    try {
      const resp = await fetch('/api/settings/simkl/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.ok) {
        setSimklStatus({ connected: false, username: null });
        setSimklDeviceAuth(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyCode = async (text) => {
    if (!text) return;
    let copied = false;
    // 1. Try modern navigator.clipboard if available
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch (err) {
        console.warn('navigator.clipboard failed:', err);
      }
    }
    // 2. Fallback to execCommand for HTTP / LAN contexts
    if (!copied) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
    }

    if (copied) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleTest = async () => {
    if (!url || !apiKey) {
      setTestResult({ ok: false, msg: 'URL and API Key are required to test' });
      return;
    }
    
    setTestResult({ ok: true, msg: 'Testing...' });
    try {
      const resp = await fetch('/api/settings/servers/test', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ name: name || 'test', url, server_type: serverType, api_key: apiKey })
      });
      
      if (resp.ok) {
        setTestResult({ ok: true, msg: 'Connection successful!' });
      } else {
        const data = await resp.json();
        setTestResult({ ok: false, msg: data.detail || 'Connection failed' });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: 'Network error or connection failed' });
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = editingId ? `/api/settings/servers/${editingId}` : '/api/settings/servers';
      const method = editingId ? 'PUT' : 'POST';
      
      await fetch(endpoint, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ name, url, server_type: serverType, api_key: apiKey })
      });
      setShowAddModal(false);
      setName('');
      setUrl('');
      setApiKey('');
      setTestResult(null);
      setEditingId(null);
      fetchServers();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (s) => {
    setEditingId(s.id);
    setName(s.name || '');
    setUrl(s.url);
    setServerType(s.server_type);
    setApiKey(s.api_key || '');
    setTestResult(null);
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this media server?')) return;
    try {
      await fetch(`/api/settings/servers/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      fetchServers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveInterval = async (e) => {
    e.preventDefault();
    setSavingInterval(true);
    try {
      await fetch('/api/settings/sync-interval', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ interval_hours: parseInt(syncInterval) })
      });
      alert('Sync interval saved successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save sync interval');
    } finally {
      setSavingInterval(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Media Servers Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Server color="var(--primary)" /> Media Servers
          </h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Configure the Emby and Jellyfin servers to push playlists to.</p>
        </div>
        <button className="btn btn-primary" onClick={() => {
          setEditingId(null);
          setName('');
          setUrl('');
          setApiKey('');
          setTestResult(null);
          setShowAddModal(!showAddModal);
        }}>
          <Plus size={18} style={{ marginRight: '0.5rem' }} /> {showAddModal && !editingId ? 'Cancel' : 'Add Server'}
        </button>
      </div>

      {showAddModal && (
        <div className="glass-panel animate-fade-in" style={{ marginBottom: '2rem', padding: '2rem' }}>
          <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', color: 'var(--primary)' }}>{editingId ? 'Edit Media Server' : 'Add Media Server'}</h3>
          <form onSubmit={handleAdd}>
            <div className="input-group">
              <label>Server Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. My Emby" />
            </div>
            <div className="input-group">
              <label>Server Type</label>
              <select value={serverType} onChange={e => setServerType(e.target.value)}>
                <option value="emby">Emby</option>
                <option value="jellyfin">Jellyfin</option>
              </select>
            </div>
            <div className="input-group">
              <label>Server URL</label>
              <input type="url" value={url} onChange={e => setUrl(e.target.value)} required placeholder="http://192.168.1.100:8096" />
            </div>
            <div className="input-group">
              <label>API Key</label>
              <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)} required />
            </div>
            
            {testResult && (
              <div style={{ padding: '1rem', borderRadius: '8px', marginBottom: '1rem', background: testResult.ok ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: testResult.ok ? 'var(--success)' : 'var(--danger)' }}>
                {testResult.msg}
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button type="button" className="btn btn-secondary" onClick={handleTest}>Test Connection</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : (editingId ? 'Save Changes' : 'Add Server')}</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid">
        {servers.length === 0 && (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', gridColumn: '1 / -1' }}>
            <Server size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
            <h3>No servers configured</h3>
            <p style={{ color: 'var(--text-muted)' }}>Add an Emby or Jellyfin server to start syncing.</p>
          </div>
        )}
        
        {servers.map(s => (
          <div key={s.id} className="card glass-panel" style={{ borderColor: 'rgba(99, 102, 241, 0.3)' }}>
            <div className="card-title">
              <span style={{ fontSize: '0.7rem', background: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>{s.server_type}</span>
              {s.name}
            </div>
            <div className="card-subtitle">{s.url}</div>
            
            <div className="card-footer" style={{ justifyContent: 'flex-end' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" style={{ padding: '0.4rem', borderRadius: '6px' }} title="Edit" onClick={() => handleEdit(s)}>
                  <Edit2 size={16} />
                </button>
                <button className="btn btn-secondary" style={{ padding: '0.4rem', borderRadius: '6px', color: 'var(--danger)' }} title="Delete" onClick={() => handleDelete(s.id)}>
                  <Trash2 size={16}/>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Trakt Account Section */}
      <div style={{ marginTop: '4rem', marginBottom: '2rem' }}>
        <h2 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Tv color="var(--primary)" /> Trakt Account
        </h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Connect your Trakt account via browser device code activation to sync your public and private lists.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '2rem', maxWidth: '650px' }}>
        {traktStatus.connected ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Check color="var(--success)" size={24} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '1.1rem', color: '#fff' }}>
                    Connected to Trakt
                  </div>
                  <div style={{ color: 'var(--primary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                    @{traktStatus.username}
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                onClick={handleDisconnectTrakt}
              >
                <Unlink size={16} style={{ marginRight: '0.5rem' }} /> Disconnect
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1.5rem', marginBottom: 0 }}>
              Your Trakt account is active and authorized. Private and personal lists will be fetched using your account credentials.
            </p>
          </div>
        ) : (
          <div>
            {!deviceAuth ? (
              <div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                  Authenticate Playlistarr with Trakt in your web browser without entering your password.
                </p>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={handleStartTraktAuth} 
                  disabled={traktLoading}
                >
                  <Tv size={18} style={{ marginRight: '0.5rem' }} />
                  {traktLoading ? 'Requesting Code...' : 'Connect Trakt (Device Code)'}
                </button>
              </div>
            ) : (
              <div className="animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>Authorize on Trakt</h3>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem' }}
                    onClick={() => setDeviceAuth(null)}
                  >
                    Cancel
                  </button>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.25)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Step 1</span>
                    <div style={{ marginTop: '0.3rem' }}>
                      <a 
                        href={deviceAuth.verification_url || "https://auth.trakt.tv/activate"} 
                        target="_blank" 
                        rel="noreferrer"
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--primary)' }}
                      >
                        Open {deviceAuth.verification_url || "trakt.tv/activate"} <ExternalLink size={16} />
                      </a>
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Step 2: Enter this code</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                      <span 
                        onClick={() => handleCopyCode(deviceAuth.user_code)}
                        title="Click to copy"
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '1.75rem',
                          fontWeight: 700,
                          letterSpacing: '0.15em',
                          background: 'rgba(99, 102, 241, 0.15)',
                          border: '1px solid var(--primary)',
                          padding: '0.5rem 1.25rem',
                          borderRadius: '8px',
                          color: '#fff',
                          cursor: 'pointer',
                          userSelect: 'all'
                        }}
                      >
                        {deviceAuth.user_code}
                      </span>
                      <button 
                        type="button" 
                        className="btn btn-secondary"
                        onClick={() => handleCopyCode(deviceAuth.user_code)}
                        title="Copy Code"
                      >
                        {copySuccess ? <Check size={18} color="var(--success)" /> : <Copy size={18} />}
                        <span style={{ marginLeft: '0.4rem', fontSize: '0.85rem', color: copySuccess ? 'var(--success)' : 'inherit' }}>
                          {copySuccess ? 'Copied!' : 'Copy'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Waiting for authorization on Trakt...</span>
                  </div>
                  {pollStatus && (
                    <div style={{ marginTop: '0.75rem', color: 'var(--danger)', fontSize: '0.85rem' }}>
                      {pollStatus}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SIMKL Account Section */}
      <div style={{ marginTop: '4rem', marginBottom: '2rem' }}>
        <h2 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Tv color="#e50914" /> SIMKL Account
        </h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Connect your SIMKL account via browser PIN activation to sync your custom lists and watchlists.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '2rem', maxWidth: '650px' }}>
        {simklStatus.connected ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Check color="var(--success)" size={24} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '1.1rem', color: '#fff' }}>
                    Connected to SIMKL
                  </div>
                  <div style={{ color: 'var(--primary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                    @{simklStatus.username}
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                onClick={handleDisconnectSimkl}
              >
                <Unlink size={16} style={{ marginRight: '0.5rem' }} /> Disconnect
              </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1.5rem', marginBottom: 0 }}>
              Your SIMKL account is active and authorized. Private lists and watchlists will sync with your account.
            </p>
          </div>
        ) : (
          <div>
            {!simklDeviceAuth ? (
              <div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                  Authenticate Playlistarr with SIMKL using a one-time verification PIN code.
                </p>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={handleStartSimklAuth} 
                  disabled={simklLoading}
                >
                  <Tv size={18} style={{ marginRight: '0.5rem' }} />
                  {simklLoading ? 'Requesting PIN...' : 'Connect SIMKL (PIN Code)'}
                </button>
              </div>
            ) : (
              <div className="animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>Authorize on SIMKL</h3>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem' }}
                    onClick={() => setSimklDeviceAuth(null)}
                  >
                    Cancel
                  </button>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.25)', borderRadius: '12px', padding: '1.5rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <div style={{ marginBottom: '1.25rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Step 1</span>
                    <div style={{ marginTop: '0.3rem' }}>
                      <a 
                        href={simklDeviceAuth.verification_url || "https://simkl.com/pin"} 
                        target="_blank" 
                        rel="noreferrer"
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--primary)' }}
                      >
                        Open {simklDeviceAuth.verification_url || "simkl.com/pin"} <ExternalLink size={16} />
                      </a>
                    </div>
                  </div>

                  <div style={{ marginBottom: '1.5rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Step 2: Enter this PIN</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                      <span 
                        onClick={() => handleCopyCode(simklDeviceAuth.user_code)}
                        title="Click to copy"
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '1.75rem',
                          fontWeight: 700,
                          letterSpacing: '0.15em',
                          background: 'rgba(99, 102, 241, 0.15)',
                          border: '1px solid var(--primary)',
                          padding: '0.5rem 1.25rem',
                          borderRadius: '8px',
                          color: '#fff',
                          cursor: 'pointer',
                          userSelect: 'all'
                        }}
                      >
                        {simklDeviceAuth.user_code}
                      </span>
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        onClick={() => handleCopyCode(simklDeviceAuth.user_code)}
                        title="Copy PIN"
                      >
                        {copySuccess ? <Check size={18} color="var(--success)" /> : <Copy size={18} />}
                        <span style={{ marginLeft: '0.4rem', fontSize: '0.85rem', color: copySuccess ? 'var(--success)' : 'inherit' }}>
                          {copySuccess ? 'Copied!' : 'Copy'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Waiting for PIN authorization on SIMKL...</span>
                  </div>
                  {simklPollStatus && (
                    <div style={{ marginTop: '0.75rem', color: 'var(--danger)', fontSize: '0.85rem' }}>
                      {simklPollStatus}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sync Settings Section */}
      <div style={{ marginTop: '4rem', marginBottom: '2rem' }}>
        <h2 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock color="var(--primary)" /> Sync Settings
        </h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Configure how often the background service checks for list updates.</p>
      </div>
      
      <div className="glass-panel" style={{ padding: '2rem', maxWidth: '500px' }}>
        <form onSubmit={handleSaveInterval}>
          <div className="input-group">
            <label>Sync Interval (Hours)</label>
            <input type="number" min="1" max="168" value={syncInterval} onChange={e => setSyncInterval(e.target.value)} required />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>Playlists will be automatically synced with Media Servers every {syncInterval} hour(s).</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={savingInterval}>{savingInterval ? 'Saving...' : 'Save Settings'}</button>
          </div>
        </form>
      </div>

    </div>
  );
}
