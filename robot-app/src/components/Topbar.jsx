import { Bell, Settings, Wifi, WifiOff } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useRobot } from '../context/RobotContext';

const pageTitles = {
  '/': 'Overview',
  '/camera': 'Vision & Camera',
  '/companion': 'AI Companion',
  '/mapping': 'Environment Mapping',
  '/movement': 'Movement Control',
  '/sensors': 'Sensors & Telemetry',
  '/settings': 'Hardware Settings',
};

export default function Topbar() {
  const { mode, setMode } = useRobot();
  const location = useLocation();

  const title = pageTitles[location.pathname] || 'Overview';
  const isLive = mode === 'live';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</div>
          <div className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-100">
            <span>NEXUS-01</span>
            <span className="text-sm text-slate-400">•</span>
            <span className="text-sm text-cyan-300">{isLive ? 'Live mode' : 'Demo mode'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode(isLive ? 'demo' : 'live')}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${isLive ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'}`}
          >
            {isLive ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isLive ? 'Live mode' : 'Demo mode'}
          </button>

          <button type="button" className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:text-white" aria-label="Notifications">
            <Bell size={16} />
          </button>
          <button type="button" className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:text-white" aria-label="Settings">
            <Settings size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
