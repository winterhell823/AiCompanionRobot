import {
  Activity,
  Bot,
  Camera,
  Cpu,
  Gauge,
  Mic,
  Radar,
  Speaker,
  Volume2,
  Waves,
} from 'lucide-react';

const icons = {
  Cpu,
  Camera,
  Bot,
  Gauge,
  Mic,
  Speaker,
  Radar,
  Volume2,
  Activity,
  Waves,
};

export default function StatusCard({ label, connected, lastUpdate, icon = 'Activity', value }) {
  const Icon = icons[icon] || Activity;

  return (
    <div className="dark-panel rounded-xl border border-slate-800 p-4 shadow-sm shadow-slate-950/20">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${connected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-700/60 text-slate-300'}`}>
            <Icon size={17} />
          </div>
          <span className="text-sm font-medium text-slate-200">{label}</span>
        </div>
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${connected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="space-y-2 text-xs text-slate-400">
        <div className="flex items-center justify-between">
          <span>State</span>
          <span className="text-slate-200">{value}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Last update</span>
          <span>{lastUpdate}</span>
        </div>
      </div>
    </div>
  );
}
