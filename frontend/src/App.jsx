import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import Setup from './pages/Setup';
import Settings from './pages/Settings';
import { useState, useEffect } from 'react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [setupComplete, setSetupComplete] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const resp = await fetch('/api/auth/setup-status');
        if (resp.ok) {
          const data = await resp.json();
          setSetupComplete(data.setupComplete);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    checkSetup();

    const token = localStorage.getItem('token');
    const admin = localStorage.getItem('isAdmin') === 'true';
    if (token) {
      setIsAuthenticated(true);
      setIsAdmin(admin);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('isAdmin');
    setIsAuthenticated(false);
    setIsAdmin(false);
  };

  if (loading) return null;

  return (
    <Router>
      <div className="layout">
        {isAuthenticated && (
          <header className="header">
            <div style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <Play color="var(--primary)" fill="var(--primary)" />
              <h1>Playlistarr</h1>
            </div>
            <nav className="nav-links">
              <Link to="/dashboard">Playlists</Link>
              {isAdmin && <Link to="/settings">Servers</Link>}
              <button className="btn btn-secondary" onClick={handleLogout} style={{padding: '0.5rem 1rem'}}>Logout</button>
            </nav>
          </header>
        )}
        
        <main className="main-content">
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
      </div>
    </Router>
  );
}

export default App;
