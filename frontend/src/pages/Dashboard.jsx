import { useState, useEffect } from 'react';
import { Plus, Settings, RefreshCw, Trash2, ListVideo, Edit2, Download } from 'lucide-react';

export default function Dashboard() {
  const [playlists, setPlaylists] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  const currentUsername = localStorage.getItem('username') || '';

  // Form State
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('trakt');
  const [url, setUrl] = useState('');
  
  // New state for user selection
  const [isGlobal, setIsGlobal] = useState(isAdmin);
  const [targetUsername, setTargetUsername] = useState(currentUsername);
  const [serverUsers, setServerUsers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  
  // New state for status
  const [playlistStatuses, setPlaylistStatuses] = useState({});

  const fetchPlaylists = async () => {
    try {
      const resp = await fetch('/api/playlists', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('isAdmin');
        window.location.href = '/login';
        return;
      }
      if (resp.ok) {
        const data = await resp.json();
        setPlaylists(data);
        
        // Fetch statuses for each playlist
        data.forEach(p => {
          fetch(`/api/playlists/${p.id}/status`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
          })
          .then(r => r.json())
          .then(st => setPlaylistStatuses(prev => ({ ...prev, [p.id]: st })))
          .catch(e => console.error(e));
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsers = async () => {
    try {
      const resp = await fetch('/api/settings/servers/users', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.ok) {
        const users = await resp.json();
        setServerUsers(users);
        if (users.length > 0) setTargetUsername(users[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPlaylists();
    fetchUsers();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const endpoint = editingId ? `/api/playlists/${editingId}` : '/api/playlists';
      const method = editingId ? 'PUT' : 'POST';
      
      const payload = {
        name,
        provider,
        source_url: url,
        is_global: isAdmin ? isGlobal : false,
        target_username: isAdmin ? (isGlobal ? null : targetUsername) : currentUsername
      };

      const resp = await fetch(endpoint, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload)
      });

      if (resp.ok) {
        setShowAddModal(false);
        setName('');
        setUrl('');
        setEditingId(null);
        fetchPlaylists();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (p) => {
    try {
      const resp = await fetch(`/api/playlists/${p.id}/export?format=json`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${p.name.replace(/\s+/g, '_')}_export.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleEdit = (p) => {
    setEditingId(p.id);
    setName(p.name);
    setProvider(p.provider);
    setUrl(p.source_url);
    setIsGlobal(p.is_global);
    setTargetUsername(p.target_username || (serverUsers.length > 0 ? serverUsers[0] : ''));
    setShowAddModal(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    try {
      const resp = await fetch(`/api/playlists/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.ok) {
        fetchPlaylists();
      } else {
        console.error('Failed to delete playlist');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSync = async (id) => {
    try {
      setPlaylistStatuses(prev => ({
        ...prev,
        [id]: { status: 'syncing', details: 'Sync queued...', last_sync: new Date().toISOString() }
      }));
      await fetch(`/api/playlists/${id}/sync`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      // Wait a bit and refresh status
      setTimeout(() => {
        fetchPlaylists();
      }, 3000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 className="page-title" style={{ margin: 0 }}>Playlists</h2>
        <button className="btn btn-primary" onClick={() => {
          setEditingId(null);
          setName('');
          setUrl('');
          setShowAddModal(!showAddModal);
        }}>
          <Plus size={18} style={{ marginRight: '0.5rem' }} /> {showAddModal && !editingId ? 'Cancel' : 'Add Playlist'}
        </button>
      </div>

      {showAddModal && (
        <div className="glass-panel animate-fade-in" style={{ marginBottom: '2rem', padding: '2rem' }}>
          <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem' }}>{editingId ? 'Edit Playlist' : 'Add Playlist'}</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>This playlist will be pushed to all configured servers.</p>
          <form onSubmit={handleAdd}>
            <div className="input-group">
              <label>Playlist Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. MCU Timeline" />
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
            
            {isAdmin ? (
              <>
                <div className="input-group">
                  <label>Target Type</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'normal' }}>
                      <input type="radio" checked={isGlobal} onChange={() => setIsGlobal(true)} style={{ width: 'auto', margin: 0 }} /> Global (All Users)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'normal' }}>
                      <input type="radio" checked={!isGlobal} onChange={() => setIsGlobal(false)} style={{ width: 'auto', margin: 0 }} /> Specific User
                    </label>
                  </div>
                </div>

                {!isGlobal && (
                  <div className="input-group">
                    <label>Select Emby/Jellyfin User</label>
                    <select value={targetUsername} onChange={e => setTargetUsername(e.target.value)} required>
                      {serverUsers.length === 0 && <option value="">No users found</option>}
                      {serverUsers.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                This playlist will automatically sync to your media server user account (<strong>{currentUsername}</strong>).
              </div>
            )}
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : (editingId ? 'Save Changes' : 'Add Playlist')}</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid">
        {playlists.length === 0 && (
          <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', gridColumn: '1 / -1' }}>
            <ListVideo size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
            <h3>No playlists added</h3>
            <p style={{ color: 'var(--text-muted)' }}>Click 'Add Playlist' to configure a source list.</p>
          </div>
        )}
        
        {playlists.map(p => (
          <div key={p.id} className="card glass-panel">
            <div className="card-title">
              {p.name}
              {p.is_global ? (
                <span style={{ fontSize: '0.7rem', background: 'var(--primary)', marginLeft: '0.5rem', padding: '2px 6px', borderRadius: '4px' }}>Global</span>
              ) : (
                <span style={{ fontSize: '0.7rem', background: 'var(--secondary)', marginLeft: '0.5rem', padding: '2px 6px', borderRadius: '4px' }}>{p.target_username}</span>
              )}
            </div>
            <div className="card-subtitle">Source: {p.provider} • Provider URL: <a href={p.source_url} target="_blank" rel="noreferrer">Link</a></div>
            
            <div className="card-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem' }}>
              
              <div style={{ padding: '0.75rem', borderRadius: '6px', background: 'rgba(0,0,0,0.2)', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ 
                    width: '8px', height: '8px', borderRadius: '50%', 
                    background: playlistStatuses[p.id]?.status === 'success' ? 'var(--success)' : 
                                playlistStatuses[p.id]?.status === 'error' ? 'var(--danger)' : 
                                playlistStatuses[p.id]?.status === 'syncing' ? 'var(--primary)' : 'var(--text-muted)' 
                  }}></span>
                  <strong style={{ textTransform: 'capitalize' }}>{playlistStatuses[p.id]?.status || 'Loading...'}</strong>
                  {playlistStatuses[p.id]?.last_sync && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>({new Date(playlistStatuses[p.id].last_sync).toLocaleString()})</span>}
                </div>
                <div style={{ color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {playlistStatuses[p.id]?.details || ''}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" style={{ padding: '0.4rem', borderRadius: '6px' }} title="Sync Now" onClick={() => handleSync(p.id)}>
                  <RefreshCw size={16} className={playlistStatuses[p.id]?.status === 'syncing' ? 'animate-spin' : ''} />
                </button>
                <button className="btn btn-secondary" style={{ padding: '0.4rem', borderRadius: '6px' }} title="Export Playlist (JSON)" onClick={() => handleExport(p)}>
                  <Download size={16} />
                </button>
                <button className="btn btn-secondary" style={{ padding: '0.4rem', borderRadius: '6px' }} title="Edit" onClick={() => handleEdit(p)}>
                  <Edit2 size={16} />
                </button>
                <button className="btn btn-secondary" style={{ padding: '0.4rem', borderRadius: '6px', color: 'var(--danger)' }} title="Delete" onClick={() => handleDelete(p.id)}>
                  <Trash2 size={16}/>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
