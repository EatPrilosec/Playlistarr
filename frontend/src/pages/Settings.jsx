import { useState, useEffect } from 'react';
import { Server, Plus, Trash2, Edit2, Clock } from 'lucide-react';

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

  useEffect(() => {
    fetchServers();
  }, []);

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
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
    } catch (err) {
      console.error(err);
    } finally {
      setSavingInterval(false);
    }
  };

  return (
    <div className="animate-fade-in">
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
