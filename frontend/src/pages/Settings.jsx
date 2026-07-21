import { useState, useEffect } from 'react';
import { Server, Plus, Trash2 } from 'lucide-react';

export default function Settings() {
  const [servers, setServers] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [serverType, setServerType] = useState('emby');
  const [apiKey, setApiKey] = useState('');

  const fetchServers = async () => {
    try {
      const resp = await fetch('/api/settings/servers', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.ok) setServers(await resp.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/settings/servers', {
        method: 'POST',
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
      fetchServers();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Server color="var(--primary)" /> Media Servers
          </h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Configure the Emby and Jellyfin servers to push playlists to.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={18} style={{ marginRight: '0.5rem' }} /> Add Server
        </button>
      </div>

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
              <button className="btn btn-secondary" style={{ padding: '0.4rem', borderRadius: '6px', color: 'var(--danger)' }} title="Delete" onClick={() => handleDelete(s.id)}>
                <Trash2 size={16}/>
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', color: 'var(--primary)' }}>Add Media Server</h3>
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
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Adding...' : 'Add Server'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
