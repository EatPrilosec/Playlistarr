import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { Play, Heart } from 'lucide-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Setup from './pages/Setup';
import Settings from './pages/Settings';
import { useState, useEffect } from 'react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState('');

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const resp = await fetch('/api/auth/setup-status');
        if (resp.ok) {
          const data = await resp.json();
          setSetupComplete(data.setupComplete);
        } else {
          setGlobalError('Backend returned an error. If you just updated, you MUST wipe your old database (docker-compose down -v).');
        }
      } catch (e) {
        console.error(e);
        setGlobalError('Failed to connect to backend server.');
      } finally {
        setLoading(false);
      }
    };
    checkSetup();

    const token = localStorage.getItem('token');
    const admin = localStorage.getItem('isAdmin') === 'true';
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          localStorage.removeItem('token');
          localStorage.removeItem('isAdmin');
          setIsAuthenticated(false);
          setIsAdmin(false);
        } else {
          setIsAuthenticated(true);
          setIsAdmin(admin);
        }
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('isAdmin');
        setIsAuthenticated(false);
        setIsAdmin(false);
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('isAdmin');
    setIsAuthenticated(false);
    setIsAdmin(false);
  };

  if (loading) return null;

  if (globalError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
        <div className="glass-panel animate-fade-in" style={{ maxWidth: '600px', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: '1rem' }}>Application Error</h2>
          <p>{globalError}</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="layout" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {isAuthenticated && (
          <header className="header">
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <Play color="var(--primary)" fill="var(--primary)" />
              <h1>Playlistarr</h1>
            </div>
            <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <Link to="/dashboard">Playlists</Link>
              {isAdmin && <Link to="/settings">Settings</Link>}
              <a
                href="https://paypal.me/DVDIsDead"
                target="_blank"
                rel="noopener noreferrer"
                className="donate-pill"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '20px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  background: 'rgba(0, 112, 186, 0.18)',
                  border: '1px solid rgba(0, 150, 255, 0.35)',
                  color: '#60b6ff',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                title="Support Playlistarr via PayPal"
              >
                <Heart size={13} fill="#ff4d6d" color="#ff4d6d" />
                <span>Donate</span>
              </a>
              <button className="btn btn-secondary" onClick={handleLogout} style={{padding: '0.5rem 1rem'}}>Logout</button>
            </nav>
          </header>
        )}
        
        <main className="main-content" style={{ flex: 1 }}>
          <Routes>
            {!setupComplete && (
              <Route path="/setup" element={<Setup onComplete={setSetupComplete} />} />
            )}
            
            <Route 
              path="/login" 
              element={!isAuthenticated ? (setupComplete ? <Login setAuth={setIsAuthenticated} setAdmin={setIsAdmin} /> : <Navigate to="/setup" />) : <Navigate to="/dashboard" />} 
            />
            
            <Route 
              path="/dashboard" 
              element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} 
            />
            
            <Route 
              path="/settings" 
              element={isAuthenticated && isAdmin ? <Settings /> : <Navigate to="/dashboard" />} 
            />
            
            <Route path="/" element={<Navigate to={!setupComplete ? "/setup" : (isAuthenticated ? "/dashboard" : "/login")} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>

        {isAuthenticated && (
          <footer style={{
            marginTop: 'auto',
            padding: '1.25rem 2rem',
            textAlign: 'center',
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '1rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <span>Playlistarr</span>
            <span>•</span>
            <a
              href="https://github.com/EatPrilosec/Playlistarr"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--text-muted)', textDecoration: 'none' }}
            >
              GitHub
            </a>
            <span>•</span>
            <a
              href="https://paypal.me/DVDIsDead"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: '#60b6ff',
                textDecoration: 'none',
                fontWeight: 500
              }}
            >
              <Heart size={13} fill="#ff4d6d" color="#ff4d6d" /> Donate (PayPal)
            </a>
          </footer>
        )}
      </div>
    </Router>
  );
}

export default App;
