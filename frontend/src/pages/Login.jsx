import { useState } from 'react';
import { Play } from 'lucide-react';

export default function Login({ setAuth, setAdmin }) {
  const [url, setUrl] = useState('http://localhost:8096');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server_url: url, username, password })
      });
      
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Login failed');
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('isAdmin', data.is_admin);
      setAdmin(data.is_admin);
      setAuth(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }} className="animate-fade-in">
      <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
          <Play color="var(--primary)" fill="var(--primary)" size={48} />
        </div>
        <h2 style={{ textAlign: 'center', marginBottom: '2rem', fontSize: '1.5rem' }}>Login to Playlistarr</h2>
        
        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '4px' }}>{error}</div>}
        
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label>Emby/Jellyfin Server URL</label>
            <input type="url" value={url} onChange={e => setUrl(e.target.value)} required placeholder="http://192.168.1.100:8096" />
          </div>
          <div className="input-group">
            <label>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required />
          </div>
          <div className="input-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Connecting...' : 'Connect to Server'}
          </button>
        </form>
      </div>
    </div>
  );
}
