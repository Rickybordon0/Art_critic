import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Admin from './pages/Admin';
import Visitor from './pages/Visitor';

// Helper to get subdomain
const getSubdomain = () => {
  const hostname = window.location.hostname; // e.g., monalisa.fondazionerossi.org
  const parts = hostname.split('.');

  // Railway domains are usually: project-name.up.railway.app (4 parts)
  // We want to avoid treating 'project-name' as a painting slug.

  // If we are on the main railway app, return null.
  if (hostname.includes('railway.app')) {
    return null;
  }

  if (parts.length >= 3) {
    if (parts[0] !== 'www' && parts[0] !== 'art-expert-client-ricky') {
      return parts[0];
    }
  }
  return null;
};

function App() {
  const subdomain = getSubdomain();

  // If a subdomain is detected, render ONLY the Visitor page for that slug
  if (subdomain) {
    return (
      <Visitor slugOverride={subdomain} />
    );
  }

  return (
    <BrowserRouter>
      <nav style={{ padding: '10px', background: '#f0f0f0', marginBottom: '20px' }}>
        <Link to="/admin" style={{ marginRight: '15px' }}>Curator (Admin)</Link>
        <Link to="/talk">Visitor (Demo)</Link>
      </nav>

      <Routes>
        <Route path="/admin" element={<Admin />} />
        <Route path="/talk" element={<Visitor />} />
        <Route path="/" element={
          <div style={{ textAlign: 'center', marginTop: '50px' }}>
            <h1>Art Expert Realtime Tool</h1>
            <p><Link to="/admin">Go to Curator Interface</Link></p>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
