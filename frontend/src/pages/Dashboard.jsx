import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, Settings, RefreshCw, Trash2, ListVideo, Edit2, Download, 
  Image as ImageIcon, Upload, X, Loader2, ListFilter, CheckCircle2, 
  XCircle, Search, Copy, Check, Film, Tv, ExternalLink 
} from 'lucide-react';

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

  // Items Inspection Modal State
  const [inspectingPlaylist, setInspectingPlaylist] = useState(null);
  const [itemsData, setItemsData] = useState(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsFilter, setItemsFilter] = useState('all'); // 'all' | 'matched' | 'unmatched'
  const [serverFilter, setServerFilter] = useState('all');
  const [itemsSearchQuery, setItemsSearchQuery] = useState('');
  const [copiedMissing, setCopiedMissing] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const handleOpenItems = async (playlist, forceRefresh = false) => {
    setInspectingPlaylist(playlist);
    setLoadingItems(true);
    setItemsFilter('all');
    setServerFilter('all');
    setItemsSearchQuery('');
    try {
      const url = forceRefresh 
        ? `/api/playlists/${playlist.id}/items?refresh=true` 
        : `/api/playlists/${playlist.id}/items`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        setItemsData(data);
      } else {
        const err = await resp.json();
        alert(err.detail || 'Failed to load playlist items');
      }
    } catch (e) {
      alert('Error fetching playlist items: ' + e.message);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleCopyMissing = () => {
    if (!itemsData || !itemsData.items) return;
    const missing = itemsData.items.filter(it => {
      if (serverFilter === 'all') return !it.matched;
      return !it.servers?.[serverFilter]?.matched;
    });
    if (missing.length === 0) return;

    const lines = [
      `Missing items for "${inspectingPlaylist?.name}" (${missing.length} items):`,
      ...missing.map(it => {
        const ids = [];
        if (it.imdb_id) ids.push(`IMDb: ${it.imdb_id}`);
        if (it.tmdb_id) ids.push(`TMDb: ${it.tmdb_id}`);
        if (it.tvdb_id) ids.push(`TVDb: ${it.tvdb_id}`);
        const idStr = ids.length ? ` [${ids.join(', ')}]` : '';
        const ep = it.show_title ? ` (${it.show_title})` : '';
        return `• #${it.order} ${it.title}${ep} (${it.year || 'N/A'})${idStr}`;
      })
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedMissing(true);
    setTimeout(() => setCopiedMissing(false), 2500);
  };

  const handleCopyId = (idText) => {
    navigator.clipboard.writeText(idText);
    setCopiedId(idText);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredItems = useMemo(() => {
    if (!itemsData || !itemsData.items) return [];
    return itemsData.items.filter(it => {
      // 1. Status Filter
      if (itemsFilter === 'matched') {
        if (serverFilter === 'all') {
          if (!it.matched) return false;
        } else {
          if (!it.servers?.[serverFilter]?.matched) return false;
        }
      } else if (itemsFilter === 'unmatched') {
        if (serverFilter === 'all') {
          if (it.matched) return false;
        } else {
          if (it.servers?.[serverFilter]?.matched) return false;
        }
      }

      // 2. Text Search
      if (itemsSearchQuery.trim()) {
        const q = itemsSearchQuery.toLowerCase();
        const t = (it.title || '').toLowerCase();
        const st = (it.show_title || '').toLowerCase();
        const y = String(it.year || '');
        const imdb = (it.imdb_id || '').toLowerCase();
        const tmdb = String(it.tmdb_id || '');
        const tvdb = String(it.tvdb_id || '');
        if (!t.includes(q) && !st.includes(q) && !y.includes(q) && !imdb.includes(q) && !tmdb.includes(q) && !tvdb.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [itemsData, itemsFilter, serverFilter, itemsSearchQuery]);

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
                  provider === 'simkl' ? 'https://simkl.com/movies/trending (or https://simkl.com/user/list/id for Pro/VIP)' :
                  provider === 'letterboxd' ? 'https://letterboxd.com/username/list/list-name/' :
                  'https://...'
                } 
              />
              {provider === 'simkl' && (
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.4rem', lineHeight: '1.4' }}>
                  <span style={{ color: '#f59e0b', fontWeight: 600 }}>Note:</span> SIMKL Discovery lists (e.g. <code>/movies/trending</code>, <code>/tv/best</code>) work free out-of-the-box. Custom lists (<code>/list/...</code>) require a paid Simkl Pro/VIP subscription on SIMKL.
                </div>
              )}
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
                
                <div 
                  onClick={() => handleOpenItems(p)}
                  style={{ 
                    padding: '0.75rem', 
                    borderRadius: '6px', 
                    background: 'rgba(0,0,0,0.25)', 
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    border: '1px solid transparent'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
                  title="Click to inspect matched and missing items"
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
                    <span style={{ fontSize: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 500 }}>
                      <ListFilter size={12} /> View Items
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {playlistStatuses[p.id]?.details || ''}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0.4rem 0.65rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 500 }} 
                    title="Inspect Matched and Missing Items" 
                    onClick={() => handleOpenItems(p)}
                  >
                    <ListFilter size={15} /> Matches
                  </button>
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

      {/* Playlist Items Inspection Modal */}
      {inspectingPlaylist && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '960px',
            height: '88vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
            overflow: 'hidden',
            background: 'var(--bg-card, #111827)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(0, 0, 0, 0.2)'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{inspectingPlaylist.name}</h3>
                  <span style={{
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: 'var(--primary)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    border: '1px solid rgba(99, 102, 241, 0.3)'
                  }}>
                    {inspectingPlaylist.provider}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span>Target: {inspectingPlaylist.is_global ? 'Global (All Users)' : inspectingPlaylist.target_username}</span>
                  {itemsData?.last_evaluated && (
                    <span>Last analyzed: {new Date(itemsData.last_evaluated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  className="btn btn-secondary"
                  disabled={loadingItems}
                  onClick={() => handleOpenItems(inspectingPlaylist, true)}
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  title="Re-fetch list from provider and re-match against libraries"
                >
                  <RefreshCw size={14} className={loadingItems ? 'animate-spin' : ''} />
                  Re-evaluate
                </button>
                <button
                  onClick={() => setInspectingPlaylist(null)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Metrics & Filter Bar */}
            <div style={{
              padding: '1rem 1.5rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(0, 0, 0, 0.15)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              {/* Tab Pills */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={() => setItemsFilter('all')}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: itemsFilter === 'all' ? 'var(--primary)' : 'rgba(255, 255, 255, 0.06)',
                    color: itemsFilter === 'all' ? '#fff' : 'var(--text-muted)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  All ({itemsData?.total_items || 0})
                </button>
                <button
                  onClick={() => setItemsFilter('matched')}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '6px',
                    background: itemsFilter === 'matched' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                    color: itemsFilter === 'matched' ? '#4ade80' : 'var(--text-muted)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    border: itemsFilter === 'matched' ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid transparent'
                  }}
                >
                  <CheckCircle2 size={14} /> Matched ({itemsData?.total_matched || 0})
                </button>
                <button
                  onClick={() => setItemsFilter('unmatched')}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '6px',
                    background: itemsFilter === 'unmatched' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                    color: itemsFilter === 'unmatched' ? '#f87171' : 'var(--text-muted)',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    border: itemsFilter === 'unmatched' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid transparent'
                  }}
                >
                  <XCircle size={14} /> Missing ({itemsData?.total_unmatched || 0})
                </button>
              </div>

              {/* Server Filter & Quick Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                {itemsData?.servers && itemsData.servers.length > 1 && (
                  <select
                    value={serverFilter}
                    onChange={e => setServerFilter(e.target.value)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      fontSize: '0.85rem',
                      borderRadius: '6px',
                      background: 'rgba(0,0,0,0.3)',
                      color: 'var(--text)',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}
                  >
                    <option value="all">All Media Servers</option>
                    {itemsData.servers.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}

                {itemsData?.total_unmatched > 0 && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleCopyMissing}
                    style={{
                      padding: '0.4rem 0.75rem',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      borderColor: copiedMissing ? 'var(--success)' : 'rgba(255, 255, 255, 0.1)'
                    }}
                    title="Copy missing titles and IMDb/TMDb IDs to clipboard for Sonarr/Radarr"
                  >
                    {copiedMissing ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                    {copiedMissing ? 'Copied Missing Items!' : 'Copy Missing'}
                  </button>
                )}
              </div>
            </div>

            {/* Search Input Bar */}
            <div style={{
              padding: '0.75rem 1.5rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(0, 0, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              position: 'relative'
            }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '2.25rem' }} />
              <input
                type="text"
                placeholder="Search by title, show, year, IMDb ID (tt...), TMDb ID..."
                value={itemsSearchQuery}
                onChange={e => setItemsSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 1rem 0.5rem 2.25rem',
                  fontSize: '0.85rem',
                  borderRadius: '6px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff'
                }}
              />
              {itemsSearchQuery && (
                <button
                  onClick={() => setItemsSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '2rem',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Scrollable Items List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
              {loadingItems ? (
                <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                  <Loader2 size={36} className="animate-spin" color="var(--primary)" style={{ margin: '0 auto 1rem' }} />
                  <p style={{ margin: 0, fontSize: '0.95rem' }}>Analyzing library items & server matches...</p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>Cross-referencing provider IDs with Emby and Jellyfin...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-muted)' }}>
                  <ListFilter size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                  <p style={{ fontSize: '1rem', fontWeight: 500, margin: 0 }}>No items match your criteria</p>
                  <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    {itemsSearchQuery ? 'Try clearing or changing your search terms.' : 'No items found for the selected filter.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {filteredItems.map(item => {
                    const isMatched = item.matched;
                    return (
                      <div
                        key={`${item.order}-${item.imdb_id || item.tmdb_id || item.title}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '0.75rem 1rem',
                          borderRadius: '8px',
                          background: isMatched ? 'rgba(255, 255, 255, 0.02)' : 'rgba(239, 68, 68, 0.04)',
                          border: isMatched ? '1px solid rgba(255, 255, 255, 0.04)' : '1px solid rgba(239, 68, 68, 0.2)',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        {/* Order Number */}
                        <span style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-muted)',
                          width: '28px',
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 500
                        }}>
                          #{item.order}
                        </span>

                        {/* Media Type Icon */}
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '6px',
                          background: item.media_type === 'episode' || item.show_title 
                            ? 'rgba(168, 85, 247, 0.15)' 
                            : 'rgba(59, 130, 246, 0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: item.media_type === 'episode' || item.show_title ? '#c084fc' : '#60a5fa',
                          flexShrink: 0
                        }}>
                          {item.media_type === 'episode' || item.show_title ? <Tv size={16} /> : <Film size={16} />}
                        </div>

                        {/* Title & Show / Episode Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#fff' }}>
                              {item.title}
                            </span>
                            {item.year && (
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                ({item.year})
                              </span>
                            )}
                          </div>

                          {item.show_title && (
                            <div style={{ fontSize: '0.8rem', color: '#c084fc', marginTop: '2px' }}>
                              {item.show_title}
                              {item.season_number != null && item.episode_number != null && (
                                <span style={{ marginLeft: '0.35rem', color: 'var(--text-muted)' }}>
                                  S{String(item.season_number).padStart(2, '0')}E{String(item.episode_number).padStart(2, '0')}
                                </span>
                              )}
                            </div>
                          )}

                          {/* ID Chips */}
                          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                            {item.imdb_id && (
                              <button
                                onClick={() => handleCopyId(item.imdb_id)}
                                title={`Click to copy IMDb ID (${item.imdb_id})`}
                                style={{
                                  background: copiedId === item.imdb_id ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.12)',
                                  color: copiedId === item.imdb_id ? '#4ade80' : '#facc15',
                                  border: '1px solid rgba(234, 179, 8, 0.25)',
                                  borderRadius: '4px',
                                  padding: '1px 6px',
                                  fontSize: '0.7rem',
                                  fontFamily: 'monospace',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                {copiedId === item.imdb_id ? <Check size={10} /> : <Copy size={10} />}
                                IMDb: {item.imdb_id}
                              </button>
                            )}
                            {item.tmdb_id && (
                              <button
                                onClick={() => handleCopyId(String(item.tmdb_id))}
                                title={`Click to copy TMDb ID (${item.tmdb_id})`}
                                style={{
                                  background: copiedId === String(item.tmdb_id) ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.12)',
                                  color: copiedId === String(item.tmdb_id) ? '#4ade80' : '#60a5fa',
                                  border: '1px solid rgba(59, 130, 246, 0.25)',
                                  borderRadius: '4px',
                                  padding: '1px 6px',
                                  fontSize: '0.7rem',
                                  fontFamily: 'monospace',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                {copiedId === String(item.tmdb_id) ? <Check size={10} /> : <Copy size={10} />}
                                TMDb: {item.tmdb_id}
                              </button>
                            )}
                            {item.tvdb_id && (
                              <button
                                onClick={() => handleCopyId(String(item.tvdb_id))}
                                title={`Click to copy TVDb ID (${item.tvdb_id})`}
                                style={{
                                  background: copiedId === String(item.tvdb_id) ? 'rgba(34, 197, 94, 0.2)' : 'rgba(168, 85, 247, 0.12)',
                                  color: copiedId === String(item.tvdb_id) ? '#4ade80' : '#c084fc',
                                  border: '1px solid rgba(168, 85, 247, 0.25)',
                                  borderRadius: '4px',
                                  padding: '1px 6px',
                                  fontSize: '0.7rem',
                                  fontFamily: 'monospace',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                {copiedId === String(item.tvdb_id) ? <Check size={10} /> : <Copy size={10} />}
                                TVDb: {item.tvdb_id}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Per-server badges */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                          {item.servers && Object.entries(item.servers).map(([sName, sData]) => (
                            <span
                              key={sName}
                              style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: sData.matched ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: sData.matched ? '#4ade80' : '#f87171',
                                border: sData.matched ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                                fontWeight: 500
                              }}
                            >
                              {sData.matched ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                              {sName}: {sData.matched ? 'In Library' : 'Missing'}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '0.85rem 1.5rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(0, 0, 0, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.85rem',
              color: 'var(--text-muted)'
            }}>
              <span>
                Showing {filteredItems.length} of {itemsData?.total_items || 0} items
                {itemsSearchQuery && ` (filtered by "${itemsSearchQuery}")`}
              </span>
              <button
                className="btn btn-secondary"
                onClick={() => setInspectingPlaylist(null)}
                style={{ padding: '0.4rem 1rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
