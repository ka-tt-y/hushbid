import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { UserDashboard } from './pages/UserDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { HistoryPage } from './pages/HistoryPage';
import { VaultPage } from './pages/VaultPage';
import { ActivityPage } from './pages/ActivityPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<UserDashboard />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/create" element={<AdminDashboard />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
