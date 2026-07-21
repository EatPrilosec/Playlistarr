import { useState, useEffect } from 'react';
import { Plus, Settings, RefreshCw, Trash2, ShieldAlert } from 'lucide-react';

export default function Admin() {
  const [playlists, setPlaylists] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('trakt');
  const [url, setUrl] = useState('');

  const fetchPlaylists = async () => {
    try {
      const resp = await fetch('/api/playlists', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        // Filter only global playlists
        setPlaylists(data.filter(p => p.is_global));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch('/api/playlists', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ name, provider, source_url: url, is_global: true })
      });
      setShowAddModal(false);
      setName('');
      setUrl('');
      fetchPlaylists();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldAlert color="var(--primary)" /> Admin Console
          </h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Manage Global Playlists pushed to all users.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={18} style={{ marginRight: '0.5rem' }} /> Add Global Playlist
        </button>
      </div>

      <div className="grid">
        {playlists.length === 0 && (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', gridColumn: '1 / -1' }}>
            <ShieldAlert size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
            <h3>No Global Playlists</h3>
            <p style={{ color: 'var(--text-muted)' }}>Global playlists are pushed to all users on the server.</p>
          </div>
        )}
        
        {playlists.map(p => (
          <div key={p.id} className="card glass-panel" style={{ borderColor: 'rgba(99, 102, 241, 0.3)' }}>
            <div className="card-title">
              <span style={{ fontSize: '0.7rem', background: 'var(--primary)', padding: '2px 6px', borderRadius: '4px' }}>GLOBAL</span>
              {p.name}
            </div>
            <div className="card-subtitle">Source: {p.provider}</div>
            
            <div className="card-footer">
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <RefreshCw size={14} /> Global Sync Active
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-secondary" style={{ padding: '0.4rem', borderRadius: '6px', color: 'var(--danger)' }} title="Delete"><Trash2 size={16}/></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', color: 'var(--primary)' }}>Add Global Playlist</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>This playlist will be forcefully pushed to ALL users on the server.</p>
            <form onSubmit={handleAdd}>
              <div className="input-group">
                <label>Playlist Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Server Rules / MCU" />
              </div>
              <div className="input-group">
                <label>Provider</label>
                <select value={provider} onChange={e => setProvider(e.target.value)}>
                  <option value="trakt">Trakt</option>
                  <option value="simkl">SIMKL</option>
                  <option value="mdblist">mdblist</option>
                  <option value="imdb">IMDb</option>
                  <option value="letterboxd">Letterboxd</option>
                </select>
              </div>
              <div className="input-group">
                <label>Source List URL</label>
                <input type="url" value={url} onChange={e => setUrl(e.target.value)} required placeholder="https://trakt.tv/users/..." />
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Adding...' : 'Add Global Playlist'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
