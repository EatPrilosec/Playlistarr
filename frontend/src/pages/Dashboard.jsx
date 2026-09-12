import { useState, useEffect, useRef } from 'react';
import { Plus, Settings, RefreshCw, Trash2, ListVideo, Edit2, Download, Image as ImageIcon, Upload, X, Loader2 } from 'lucide-react';

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
  
  // Artwork State
  const [imageUrl, setImageUrl] = useState('');
  const [backdropUrl, setBackdropUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [uploadingType, setUploadingType] = useState(null);

  const posterInputRef = useRef(null);
  const backdropInputRef = useRef(null);
  const bannerInputRef = useRef(null);
  
  // User selection
  const [isGlobal, setIsGlobal] = useState(isAdmin);
  const [targetUsername, setTargetUsername] = useState(currentUsername);
  const [serverUsers, setServerUsers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  
  // Status state
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

  const handleFileUpload = async (file, type) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      setUploadingType(type);
      const resp = await fetch('/api/playlists/upload-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      if (resp.ok) {
        const data = await resp.json();
        if (type === 'primary') setImageUrl(data.url);
        else if (type === 'backdrop') setBackdropUrl(data.url);
        else if (type === 'banner') setBannerUrl(data.url);
      } else {
        const err = await resp.json();
        alert(err.detail || 'Failed to upload image');
      }
    } catch (e) {
      console.error(e);
      alert('Error uploading image');
    } finally {
      setUploadingType(null);
    }
  };

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
        target_username: isAdmin ? (isGlobal ? null : targetUsername) : currentUsername,
        image_url: imageUrl || null,
        backdrop_url: backdropUrl || null,
        banner_url: bannerUrl || null
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
        setImageUrl('');
        setBackdropUrl('');
        setBannerUrl('');
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
    setImageUrl(p.image_url || '');
    setBackdropUrl(p.backdrop_url || '');
    setBannerUrl(p.banner_url || '');
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
          setImageUrl('');
          setBackdropUrl('');
          setBannerUrl('');
          setShowAddModal(!showAddModal);
        }}>
          <Plus size={18} style={{ marginRight: '0.5rem' }} /> {showAddModal && !editingId ? 'Cancel' : 'Add Playlist'}
        </button>
      </div>

      {showAddModal && (
        <div className="glass-panel animate-fade-in" style={{ marginBottom: '2rem', padding: '2rem' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1.3rem' }}>{editingId ? 'Edit Playlist' : 'Add Playlist'}</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Configure source list, metadata, and custom artwork to push to Emby and Jellyfin.
          </p>
          <form onSubmit={handleAdd}>
            <div className="input-group">
              <label>Playlist Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Marvel Cinematic Universe" />
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
              <input 
                type="url" 
                value={url} 
                onChange={e => setUrl(e.target.value)} 
                required 
                placeholder={
                  provider === 'trakt' ? 'https://trakt.tv/users/username/lists/list-name' :
                  provider === 'imdb' ? 'https://www.imdb.com/list/ls055592025/ or https://www.imdb.com/chart/top' :
                  provider === 'mdblist' ? 'https://mdblist.com/lists/official/movies/justwatch-streaming-charts' :
                  provider === 'simkl' ? 'https://simkl.com/movies/trending or https://simkl.com/5742139/list/6837' :
                  provider === 'letterboxd' ? 'https://letterboxd.com/username/list/list-name/' :
                  'https://...'
                } 
              />
            </div>

            {/* Artwork Section */}
            <div style={{ 
              margin: '1.5rem 0', 
              padding: '1.5rem', 
              borderRadius: '10px', 
              background: 'rgba(255, 255, 255, 0.03)', 
              border: '1px solid var(--border)' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', fontWeight: 600, fontSize: '1.05rem', color: 'var(--text)' }}>
                <ImageIcon size={20} color="var(--primary)" />
                <span>Playlist Artwork & Media</span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                
                {/* Poster / Thumbnail */}
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
                    Poster / Thumbnail
                  </label>
                  
                  <div style={{ 
                    width: '100%', 
                    height: '140px', 
                    borderRadius: '6px', 
                    background: 'rgba(0,0,0,0.3)', 
                    border: '1px dashed var(--border)',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    position: 'relative', 
                    overflow: 'hidden',
                    marginBottom: '0.75rem'
                  }}>
                    {imageUrl ? (
                      <>
                        <img src={imageUrl} alt="Poster" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        <button 
                          type="button" 
                          onClick={() => setImageUrl('')}
                          style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', color: '#ff5555', padding: '4px', cursor: 'pointer' }}
                          title="Remove poster"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <div 
                        onClick={() => posterInputRef.current?.click()} 
                        style={{ textAlign: 'center', color: 'var(--text-muted)', cursor: 'pointer', padding: '1rem' }}
                      >
                        {uploadingType === 'primary' ? (
                          <Loader2 size={24} className="animate-spin" color="var(--primary)" style={{ margin: '0 auto 0.5rem' }} />
                        ) : (
                          <Upload size={24} style={{ margin: '0 auto 0.5rem' }} />
                        )}
                        <span style={{ fontSize: '0.75rem', display: 'block' }}>Click to upload poster file</span>
                      </div>
                    )}
                  </div>
                  
                  <input 
                    type="file" 
                    ref={posterInputRef} 
                    style={{ display: 'none' }} 
                    accept="image/*"
                    onChange={e => handleFileUpload(e.target.files?.[0], 'primary')}
                  />
                  <input 
                    type="text" 
                    value={imageUrl} 
                    onChange={e => setImageUrl(e.target.value)} 
                    placeholder="or paste image URL..." 
                    style={{ fontSize: '0.8rem', padding: '0.5rem' }}
                  />
                </div>

                {/* Backdrop / Background */}
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
                    Backdrop / Fanart
                  </label>
                  
                  <div style={{ 
                    width: '100%', 
                    height: '140px', 
                    borderRadius: '6px', 
                    background: 'rgba(0,0,0,0.3)', 
                    border: '1px dashed var(--border)',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    position: 'relative', 
                    overflow: 'hidden',
                    marginBottom: '0.75rem'
                  }}>
                    {backdropUrl ? (
                      <>
                        <img src={backdropUrl} alt="Backdrop" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button 
                          type="button" 
                          onClick={() => setBackdropUrl('')}
                          style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', color: '#ff5555', padding: '4px', cursor: 'pointer' }}
                          title="Remove backdrop"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <div 
                        onClick={() => backdropInputRef.current?.click()} 
                        style={{ textAlign: 'center', color: 'var(--text-muted)', cursor: 'pointer', padding: '1rem' }}
                      >
                        {uploadingType === 'backdrop' ? (
                          <Loader2 size={24} className="animate-spin" color="var(--primary)" style={{ margin: '0 auto 0.5rem' }} />
                        ) : (
                          <Upload size={24} style={{ margin: '0 auto 0.5rem' }} />
                        )}
                        <span style={{ fontSize: '0.75rem', display: 'block' }}>Click to upload backdrop file</span>
                      </div>
                    )}
                  </div>
                  
                  <input 
                    type="file" 
                    ref={backdropInputRef} 
                    style={{ display: 'none' }} 
                    accept="image/*"
                    onChange={e => handleFileUpload(e.target.files?.[0], 'backdrop')}
                  />
                  <input 
                    type="text" 
                    value={backdropUrl} 
                    onChange={e => setBackdropUrl(e.target.value)} 
                    placeholder="or paste backdrop URL..." 
                    style={{ fontSize: '0.8rem', padding: '0.5rem' }}
                  />
                </div>

                {/* Banner */}
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
                    Banner
                  </label>
                  
                  <div style={{ 
                    width: '100%', 
                    height: '140px', 
                    borderRadius: '6px', 
                    background: 'rgba(0,0,0,0.3)', 
                    border: '1px dashed var(--border)',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    position: 'relative', 
                    overflow: 'hidden',
                    marginBottom: '0.75rem'
                  }}>
                    {bannerUrl ? (
                      <>
                        <img src={bannerUrl} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        <button 
                          type="button" 
                          onClick={() => setBannerUrl('')}
                          style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', color: '#ff5555', padding: '4px', cursor: 'pointer' }}
                          title="Remove banner"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <div 
                        onClick={() => bannerInputRef.current?.click()} 
                        style={{ textAlign: 'center', color: 'var(--text-muted)', cursor: 'pointer', padding: '1rem' }}
                      >
                        {uploadingType === 'banner' ? (
                          <Loader2 size={24} className="animate-spin" color="var(--primary)" style={{ margin: '0 auto 0.5rem' }} />
                        ) : (
                          <Upload size={24} style={{ margin: '0 auto 0.5rem' }} />
                        )}
                        <span style={{ fontSize: '0.75rem', display: 'block' }}>Click to upload banner file</span>
                      </div>
                    )}
                  </div>
                  
                  <input 
                    type="file" 
                    ref={bannerInputRef} 
                    style={{ display: 'none' }} 
                    accept="image/*"
                    onChange={e => handleFileUpload(e.target.files?.[0], 'banner')}
                  />
                  <input 
                    type="text" 
                    value={bannerUrl} 
                    onChange={e => setBannerUrl(e.target.value)} 
                    placeholder="or paste banner URL..." 
                    style={{ fontSize: '0.8rem', padding: '0.5rem' }}
                  />
                </div>

              </div>
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
          <div key={p.id} className="card glass-panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Visual Hero Header */}
            <div style={{
              height: '120px',
              width: '100%',
              position: 'relative',
              background: p.backdrop_url || p.banner_url || p.image_url 
                ? `url(${p.backdrop_url || p.banner_url || p.image_url}) center/cover no-repeat` 
                : 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              {/* Gradient Overlay */}
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(to bottom, rgba(15, 23, 42, 0.2) 0%, rgba(15, 23, 42, 0.85) 100%)'
              }} />

              {/* Floating Poster Thumbnail if present */}
              {p.image_url && (
                <img
                  src={p.image_url}
                  alt={p.name}
                  style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '16px',
                    width: '54px',
                    height: '80px',
                    objectFit: 'cover',
                    borderRadius: '6px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
                    background: '#000'
                  }}
                />
              )}

              {/* Badges on Hero */}
              <div style={{
                position: 'absolute',
                bottom: '12px',
                left: p.image_url ? '82px' : '16px',
                right: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{
                  fontSize: '0.7rem',
                  background: 'rgba(0,0,0,0.6)',
                  backdropFilter: 'blur(4px)',
                  color: 'var(--text-muted)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  {p.provider}
                </span>

                {p.is_global ? (
                  <span style={{ fontSize: '0.7rem', background: 'var(--primary)', padding: '2px 8px', borderRadius: '4px', color: '#fff', fontWeight: 600 }}>
                    Global
                  </span>
                ) : (
                  <span style={{ fontSize: '0.7rem', background: 'var(--secondary)', padding: '2px 8px', borderRadius: '4px', color: '#fff', fontWeight: 600 }}>
                    {p.target_username}
                  </span>
                )}
              </div>
            </div>

            {/* Card Body */}
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div className="card-title" style={{ fontSize: '1.15rem', marginBottom: '0.35rem' }}>
                {p.name}
              </div>
              <div className="card-subtitle" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                Source: <a href={p.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>View List</a>
              </div>
              
              <div className="card-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '1rem', marginTop: 'auto', paddingTop: '1rem' }}>
                
                <div style={{ padding: '0.75rem', borderRadius: '6px', background: 'rgba(0,0,0,0.25)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ 
                      width: '8px', height: '8px', borderRadius: '50%', 
                      background: playlistStatuses[p.id]?.status === 'success' ? 'var(--success)' : 
                                  playlistStatuses[p.id]?.status === 'error' ? 'var(--danger)' : 
                                  playlistStatuses[p.id]?.status === 'syncing' ? 'var(--primary)' : 'var(--text-muted)' 
                    }}></span>
                    <strong style={{ textTransform: 'capitalize' }}>{playlistStatuses[p.id]?.status || 'Loading...'}</strong>
                    {playlistStatuses[p.id]?.last_sync && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        ({new Date(playlistStatuses[p.id].last_sync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    )}
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

          </div>
        ))}
      </div>
    </div>
  );
}
