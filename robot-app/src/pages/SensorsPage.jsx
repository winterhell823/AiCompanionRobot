import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, Camera, Gauge, Mic, Volume2 } from 'lucide-react';
import { distanceHistory } from '../data/demoData';

export default function SensorsPage() {
  return (
    <div className="space-y-6 pb-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="dark-panel rounded-xl border border-slate-800 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Distance</div>
          <div className="mt-2 text-3xl font-semibold text-white">74 cm</div>
          <div className="mt-2 text-xs text-amber-300">Demo sample range</div>
        </div>
        <div className="dark-panel rounded-xl border border-slate-800 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Obstacle</div>
          <div className="mt-2 text-2xl font-semibold text-amber-300">Detected</div>
          <div className="mt-2 text-xs text-slate-400">Threshold: 42 cm</div>
        </div>
        <div className="dark-panel rounded-xl border border-slate-800 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Camera</div>
          <div className="mt-2 text-xl font-semibold text-white">Connected</div>
          <div className="mt-2 text-xs text-slate-400">Last update: 1 sec ago</div>
        </div>
        <div className="dark-panel rounded-xl border border-slate-800 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Mic</div>
          <div className="mt-2 text-xl font-semibold text-white">Listening</div>
          <div className="mt-2 text-xs text-slate-400">Noise floor nominal</div>
        </div>
        <div className="dark-panel rounded-xl border border-slate-800 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Motor driver</div>
          <div className="mt-2 text-xl font-semibold text-white">Stable</div>
          <div className="mt-2 text-xs text-slate-400">Power draw nominal</div>
        </div>
      </div>

      <div className="dark-panel rounded-2xl border border-slate-800 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Telemetry</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Distance history</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300"><Gauge size={14} /> 42 cm threshold</div>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={distanceHistory}>
              <defs>
                <linearGradient id="distanceFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#94a3b8" tickLine={false} axisLine={false} />
              <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ backgroundColor: '#020617', border: '1px solid #334155', borderRadius: '12px' }} />
              <Area type="monotone" dataKey="distance" stroke="#22d3ee" fill="url(#distanceFill)" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
            <AlertTriangle size={14} /> Obstacle status
          </div>
          <div className="text-lg font-semibold text-white">Forward blockage detected</div>
          <div className="mt-2 text-sm text-slate-300">No contact yet, but the object boundary is emerging within the current forward sensor cone.</div>
        </div>

        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
            <Activity size={14} /> System state
          </div>
          <div className="space-y-2 text-sm text-slate-200">
            <div className="flex items-center justify-between"><span>ESP32</span><span className="text-emerald-300">Connected</span></div>
            <div className="flex items-center justify-between"><span>Camera</span><span className="text-emerald-300">Connected</span></div>
            <div className="flex items-center justify-between"><span>Microphone</span><span className="text-emerald-300">Enabled</span></div>
            <div className="flex items-center justify-between"><span>Speaker</span><span className="text-emerald-300">Enabled</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
