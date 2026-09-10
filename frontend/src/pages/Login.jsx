import { useState } from 'react';
import { Play } from 'lucide-react';

export default function Login({ setAuth, setAdmin }) {
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
        body: JSON.stringify({ username, password })
      });
      
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Login failed');
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('isAdmin', data.is_admin);
      localStorage.setItem('username', data.username || username);
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
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <Play color="var(--primary)" fill="var(--primary)" size={48} />
        </div>
        <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', fontSize: '1.5rem' }}>Login to Playlistarr</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '2rem' }}>
          Sign in with your Admin account or your Emby / Jellyfin media server credentials.
        </p>
        
        {error && <div style={{ color: 'var(--danger)', marginBottom: '1rem', textAlign: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '4px' }}>{error}</div>}
        
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required />
          </div>
          <div className="input-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
