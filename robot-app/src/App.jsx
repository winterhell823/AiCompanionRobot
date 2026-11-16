import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { RobotProvider } from './context/RobotContext';
import OverviewPage from './pages/OverviewPage';
import CameraPage from './pages/CameraPage';
import CompanionPage from './pages/CompanionPage';
import MappingPage from './pages/MappingPage';
import MovementPage from './pages/MovementPage';
import SensorsPage from './pages/SensorsPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  return (
    <RobotProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<OverviewPage />} />
            <Route path="camera" element={<CameraPage />} />
            <Route path="companion" element={<CompanionPage />} />
            <Route path="mapping" element={<MappingPage />} />
            <Route path="movement" element={<MovementPage />} />
            <Route path="sensors" element={<SensorsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </RobotProvider>
  );
}

export default App;
