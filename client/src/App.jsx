import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Admin from './pages/Admin';
import Visitor from './pages/Visitor';

function App() {
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
