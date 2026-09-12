import { useState, useEffect } from 'react';
import { 
  Server, Plus, Trash2, Edit2, Clock, Tv, ExternalLink, Copy, Check, 
  RefreshCw, Unlink, Film, Download, CheckCircle2, AlertCircle, Loader2 
} from 'lucide-react';

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

  // Radarr State
  const [radarrConfig, setRadarrConfig] = useState({ configured: false, url: '', api_key: '', quality_profile_id: null, root_folder_path: '', search_on_add: true });
  const [radarrUrl, setRadarrUrl] = useState('');
  const [radarrApiKey, setRadarrApiKey] = useState('');
  const [radarrProfileId, setRadarrProfileId] = useState('');
  const [radarrFolderPath, setRadarrFolderPath] = useState('');
  const [radarrSearchOnAdd, setRadarrSearchOnAdd] = useState(true);
  const [radarrProfiles, setRadarrProfiles] = useState([]);
  const [radarrFolders, setRadarrFolders] = useState([]);
  const [radarrTesting, setRadarrTesting] = useState(false);
  const [radarrTestResult, setRadarrTestResult] = useState(null);
  const [radarrSaving, setRadarrSaving] = useState(false);

  // Sonarr State
  const [sonarrConfig, setSonarrConfig] = useState({ configured: false, url: '', api_key: '', quality_profile_id: null, root_folder_path: '', search_on_add: true });
  const [sonarrUrl, setSonarrUrl] = useState('');
  const [sonarrApiKey, setSonarrApiKey] = useState('');
  const [sonarrProfileId, setSonarrProfileId] = useState('');
  const [sonarrFolderPath, setSonarrFolderPath] = useState('');
  const [sonarrSearchOnAdd, setSonarrSearchOnAdd] = useState(true);
  const [sonarrProfiles, setSonarrProfiles] = useState([]);
  const [sonarrFolders, setSonarrFolders] = useState([]);
  const [sonarrTesting, setSonarrTesting] = useState(false);
  const [sonarrTestResult, setSonarrTestResult] = useState(null);
  const [sonarrSaving, setSonarrSaving] = useState(false);

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
    fetchArrSettings();
  }, []);

  const fetchArrSettings = async () => {
    try {
      const resp = await fetch('/api/settings/arr', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.radarr) {
          setRadarrConfig(data.radarr);
          setRadarrUrl(data.radarr.url || '');
          setRadarrApiKey(data.radarr.api_key || '');
          setRadarrProfileId(data.radarr.quality_profile_id || '');
          setRadarrFolderPath(data.radarr.root_folder_path || '');
          setRadarrSearchOnAdd(data.radarr.search_on_add !== false);
          if (data.radarr.configured) {
            handleTestArr('radarr', data.radarr.url, data.radarr.api_key, false);
          }
        }
        if (data.sonarr) {
          setSonarrConfig(data.sonarr);
          setSonarrUrl(data.sonarr.url || '');
          setSonarrApiKey(data.sonarr.api_key || '');
          setSonarrProfileId(data.sonarr.quality_profile_id || '');
          setSonarrFolderPath(data.sonarr.root_folder_path || '');
          setSonarrSearchOnAdd(data.sonarr.search_on_add !== false);
          if (data.sonarr.configured) {
            handleTestArr('sonarr', data.sonarr.url, data.sonarr.api_key, false);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTestArr = async (type, testUrl = null, testKey = null, setAlertMsg = true) => {
    const isRadarr = type === 'radarr';
    const targetUrl = testUrl ?? (isRadarr ? radarrUrl : sonarrUrl);
    const targetKey = testKey ?? (isRadarr ? radarrApiKey : sonarrApiKey);

    if (!targetUrl || !targetKey) {
      if (setAlertMsg) {
        if (isRadarr) setRadarrTestResult({ ok: false, msg: 'URL and API Key are required to test' });
        else setSonarrTestResult({ ok: false, msg: 'URL and API Key are required to test' });
      }
      return;
    }

    if (isRadarr) setRadarrTesting(true);
    else setSonarrTesting(true);

    try {
      const resp = await fetch('/api/settings/arr/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ type, url: targetUrl, api_key: targetKey })
      });
      const data = await resp.json();
      if (resp.ok) {
        if (isRadarr) {
          setRadarrProfiles(data.quality_profiles || []);
          setRadarrFolders(data.root_folders || []);
          if (!radarrProfileId && data.quality_profiles?.length) {
            setRadarrProfileId(data.quality_profiles[0].id);
          }
          if (!radarrFolderPath && data.root_folders?.length) {
            setRadarrFolderPath(data.root_folders[0].path);
          }
          if (setAlertMsg) setRadarrTestResult({ ok: true, msg: `Connected to ${data.app_name} v${data.version}!` });
        } else {
          setSonarrProfiles(data.quality_profiles || []);
          setSonarrFolders(data.root_folders || []);
          if (!sonarrProfileId && data.quality_profiles?.length) {
            setSonarrProfileId(data.quality_profiles[0].id);
          }
          if (!sonarrFolderPath && data.root_folders?.length) {
            setSonarrFolderPath(data.root_folders[0].path);
          }
          if (setAlertMsg) setSonarrTestResult({ ok: true, msg: `Connected to ${data.app_name} v${data.version}!` });
        }
      } else {
        if (setAlertMsg) {
          if (isRadarr) setRadarrTestResult({ ok: false, msg: data.detail || 'Connection failed' });
          else setSonarrTestResult({ ok: false, msg: data.detail || 'Connection failed' });
        }
      }
    } catch (e) {
      if (setAlertMsg) {
        if (isRadarr) setRadarrTestResult({ ok: false, msg: e.message || 'Connection error' });
        else setSonarrTestResult({ ok: false, msg: e.message || 'Connection error' });
      }
    } finally {
      if (isRadarr) setRadarrTesting(false);
      else setSonarrTesting(false);
    }
  };

  const handleSaveArr = async (type) => {
    const isRadarr = type === 'radarr';
    if (isRadarr) setRadarrSaving(true);
    else setSonarrSaving(true);

    try {
      const payload = isRadarr ? {
        type: 'radarr',
        url: radarrUrl,
        api_key: radarrApiKey,
        quality_profile_id: radarrProfileId ? parseInt(radarrProfileId) : null,
        root_folder_path: radarrFolderPath,
        search_on_add: radarrSearchOnAdd
      } : {
        type: 'sonarr',
        url: sonarrUrl,
        api_key: sonarrApiKey,
        quality_profile_id: sonarrProfileId ? parseInt(sonarrProfileId) : null,
        root_folder_path: sonarrFolderPath,
        search_on_add: sonarrSearchOnAdd
      };

      const resp = await fetch('/api/settings/arr', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        const res = await resp.json();
        if (isRadarr) {
          setRadarrConfig(res.config);
          setRadarrTestResult({ ok: true, msg: 'Radarr configuration saved successfully!' });
        } else {
          setSonarrConfig(res.config);
          setSonarrTestResult({ ok: true, msg: 'Sonarr configuration saved successfully!' });
        }
      } else {
        const err = await resp.json();
        alert(err.detail || 'Failed to save settings');
      }
    } catch (e) {
      alert(e.message || 'Failed to save settings');
    } finally {
      if (isRadarr) setRadarrSaving(false);
      else setSonarrSaving(false);
    }
  };

  const handleDisconnectArr = async (type) => {
    if (!window.confirm(`Are you sure you want to disconnect ${type === 'radarr' ? 'Radarr' : 'Sonarr'}?`)) return;
    try {
      const resp = await fetch('/api/settings/arr/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ type })
      });
      if (resp.ok) {
        if (type === 'radarr') {
          setRadarrConfig({ configured: false, url: '', api_key: '', quality_profile_id: null, root_folder_path: '', search_on_add: true });
          setRadarrUrl('');
          setRadarrApiKey('');
          setRadarrProfileId('');
          setRadarrFolderPath('');
          setRadarrTestResult(null);
          setRadarrProfiles([]);
          setRadarrFolders([]);
        } else {
          setSonarrConfig({ configured: false, url: '', api_key: '', quality_profile_id: null, root_folder_path: '', search_on_add: true });
          setSonarrUrl('');
          setSonarrApiKey('');
          setSonarrProfileId('');
          setSonarrFolderPath('');
          setSonarrTestResult(null);
          setSonarrProfiles([]);
          setSonarrFolders([]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

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

      {/* Media Automation (*Arr) Section */}
      <div style={{ marginTop: '4rem', marginBottom: '2rem' }}>
        <h2 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Download color="var(--primary)" /> Media Automation (Radarr & Sonarr)
        </h2>
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Connect Radarr and Sonarr to automatically add missing movies and TV series directly from your playlists.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        
        {/* Radarr Card */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: 'rgba(234, 179, 8, 0.15)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#facc15'
              }}>
                <Film size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Radarr</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Movies Manager</span>
              </div>
            </div>

            {radarrConfig.configured ? (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--success)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                fontWeight: 600
              }}>
                <CheckCircle2 size={13} /> Connected
              </span>
            ) : (
              <span style={{
                fontSize: '0.75rem',
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-muted)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                Not Configured
              </span>
            )}
          </div>

          <form onSubmit={e => { e.preventDefault(); handleSaveArr('radarr'); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
            <div className="input-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.85rem' }}>Radarr URL</label>
              <input
                type="url"
                placeholder="http://192.168.1.100:7878"
                value={radarrUrl}
                onChange={e => setRadarrUrl(e.target.value)}
                required
              />
            </div>

            <div className="input-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.85rem' }}>API Key</label>
              <input
                type="password"
                placeholder="Radarr API Key"
                value={radarrApiKey}
                onChange={e => setRadarrApiKey(e.target.value)}
                required
              />
            </div>

            {radarrTestResult && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                background: radarrTestResult.ok ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: radarrTestResult.ok ? 'var(--success)' : 'var(--danger)',
                border: radarrTestResult.ok ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                {radarrTestResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{radarrTestResult.msg}</span>
              </div>
            )}

            {radarrFolders.length > 0 && (
              <div className="input-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.85rem' }}>Root Folder</label>
                <select value={radarrFolderPath} onChange={e => setRadarrFolderPath(e.target.value)}>
                  {radarrFolders.map(rf => (
                    <option key={rf.path} value={rf.path}>
                      {rf.path}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {radarrProfiles.length > 0 && (
              <div className="input-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.85rem' }}>Quality Profile</label>
                <select value={radarrProfileId} onChange={e => setRadarrProfileId(e.target.value)}>
                  {radarrProfiles.map(qp => (
                    <option key={qp.id} value={qp.id}>
                      {qp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input
                type="checkbox"
                id="radarrSearch"
                checked={radarrSearchOnAdd}
                onChange={e => setRadarrSearchOnAdd(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              <label htmlFor="radarrSearch" style={{ fontSize: '0.85rem', margin: 0, cursor: 'pointer', fontWeight: 'normal' }}>
                Start search for movie upon adding
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '1rem' }}>
              {radarrConfig.configured && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)', marginRight: 'auto' }}
                  onClick={() => handleDisconnectArr('radarr')}
                  title="Disconnect Radarr"
                >
                  <Unlink size={15} /> Disconnect
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={radarrTesting}
                onClick={() => handleTestArr('radarr')}
              >
                {radarrTesting ? <RefreshCw size={15} className="animate-spin" /> : 'Test & Load'}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={radarrSaving}
              >
                {radarrSaving ? 'Saving...' : 'Save Radarr'}
              </button>
            </div>
          </form>
        </div>

        {/* Sonarr Card */}
        <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa'
              }}>
                <Tv size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Sonarr</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>TV Series Manager</span>
              </div>
            </div>

            {sonarrConfig.configured ? (
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--success)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                fontWeight: 600
              }}>
                <CheckCircle2 size={13} /> Connected
              </span>
            ) : (
              <span style={{
                fontSize: '0.75rem',
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-muted)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                Not Configured
              </span>
            )}
          </div>

          <form onSubmit={e => { e.preventDefault(); handleSaveArr('sonarr'); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
            <div className="input-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.85rem' }}>Sonarr URL</label>
              <input
                type="url"
                placeholder="http://192.168.1.100:8989"
                value={sonarrUrl}
                onChange={e => setSonarrUrl(e.target.value)}
                required
              />
            </div>

            <div className="input-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.85rem' }}>API Key</label>
              <input
                type="password"
                placeholder="Sonarr API Key"
                value={sonarrApiKey}
                onChange={e => setSonarrApiKey(e.target.value)}
                required
              />
            </div>

            {sonarrTestResult && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                background: sonarrTestResult.ok ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                color: sonarrTestResult.ok ? 'var(--success)' : 'var(--danger)',
                border: sonarrTestResult.ok ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(239, 68, 68, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                {sonarrTestResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{sonarrTestResult.msg}</span>
              </div>
            )}

            {sonarrFolders.length > 0 && (
              <div className="input-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.85rem' }}>Root Folder</label>
                <select value={sonarrFolderPath} onChange={e => setSonarrFolderPath(e.target.value)}>
                  {sonarrFolders.map(rf => (
                    <option key={rf.path} value={rf.path}>
                      {rf.path}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {sonarrProfiles.length > 0 && (
              <div className="input-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.85rem' }}>Quality Profile</label>
                <select value={sonarrProfileId} onChange={e => setSonarrProfileId(e.target.value)}>
                  {sonarrProfiles.map(qp => (
                    <option key={qp.id} value={qp.id}>
                      {qp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input
                type="checkbox"
                id="sonarrSearch"
                checked={sonarrSearchOnAdd}
                onChange={e => setSonarrSearchOnAdd(e.target.checked)}
                style={{ width: 'auto', margin: 0 }}
              />
              <label htmlFor="sonarrSearch" style={{ fontSize: '0.85rem', margin: 0, cursor: 'pointer', fontWeight: 'normal' }}>
                Start search for missing episodes upon adding
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '1rem' }}>
              {sonarrConfig.configured && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)', marginRight: 'auto' }}
                  onClick={() => handleDisconnectArr('sonarr')}
                  title="Disconnect Sonarr"
                >
                  <Unlink size={15} /> Disconnect
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={sonarrTesting}
                onClick={() => handleTestArr('sonarr')}
              >
                {sonarrTesting ? <RefreshCw size={15} className="animate-spin" /> : 'Test & Load'}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={sonarrSaving}
              >
                {sonarrSaving ? 'Saving...' : 'Save Sonarr'}
              </button>
            </div>
          </form>
        </div>

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
