/**
 * Talkie App
 * 
 * Main application component with routing setup.
 * Routes:
 * - / : Home page (create room)
 * - /room/:roomId : Chat room
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { ChatRoom } from './pages/ChatRoom';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<ChatRoom />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
