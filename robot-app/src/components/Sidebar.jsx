import { NavLink } from 'react-router-dom';
import {
  Activity,
  Bot,
  Camera,
  Gauge,
  Map,
  Mic,
  Settings,
  Shield,
  SlidersHorizontal,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Overview', icon: Activity },
  { to: '/camera', label: 'Vision & Camera', icon: Camera },
  { to: '/companion', label: 'AI Companion', icon: Bot },
  { to: '/mapping', label: 'Environment Mapping', icon: Map },
  { to: '/movement', label: 'Movement Control', icon: Shield },
  { to: '/sensors', label: 'Sensors & Telemetry', icon: Gauge },
  { to: '/settings', label: 'Hardware Settings', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-72 border-r border-slate-800 bg-slate-950/90 p-5 lg:flex lg:flex-col">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
          <SlidersHorizontal size={18} />
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">NEXUS</div>
          <div className="text-lg font-semibold text-slate-100">ROBOTICS</div>
        </div>
      </div>

      <nav className="space-y-2">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'bg-slate-800 text-white ring-1 ring-cyan-500/30' : 'text-slate-300 hover:bg-slate-900 hover:text-white'}`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
          <Mic size={14} /> Robot
        </div>
        <div className="text-sm text-slate-100">NEXUS-01</div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <span>System health</span>
          <span className="text-emerald-300">Nominal</span>
        </div>
      </div>
    </aside>
  );
}
