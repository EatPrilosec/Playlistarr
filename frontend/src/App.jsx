import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import { useState, useEffect } from 'react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
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
              <Link to="/dashboard">Dashboard</Link>
              {isAdmin && <Link to="/admin">Admin</Link>}
              <button className="btn btn-secondary" onClick={handleLogout} style={{padding: '0.5rem 1rem'}}>Logout</button>
            </nav>
          </header>
        )}
        
        <main className="main-content">
          <Routes>
            <Route 
              path="/login" 
              element={!isAuthenticated ? <Login setAuth={setIsAuthenticated} setAdmin={setIsAdmin} /> : <Navigate to="/dashboard" />} 
            />
            <Route 
              path="/dashboard" 
              element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} 
            />
            <Route 
              path="/admin" 
              element={isAuthenticated && isAdmin ? <Admin /> : <Navigate to="/dashboard" />} 
            />
            <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
