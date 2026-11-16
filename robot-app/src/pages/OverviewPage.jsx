import { ArrowRight, Camera, Circle, Gauge, MessageSquareText, Mic, Radar, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import ControlPad from '../components/ControlPad';
import MapCanvas from '../components/MapCanvas';
import StatusCard from '../components/StatusCard';
import { activityFeed, conversation, hardwareStatus, mappingSample } from '../data/demoData';
import { useRobot } from '../context/RobotContext';

export default function OverviewPage() {
  const { mode } = useRobot();
  const [streaming, setStreaming] = useState(true);
  const [recording, setRecording] = useState(false);
  const [lastCommand, setLastCommand] = useState('Idle');

  const handleMove = (direction) => setLastCommand(`Move: ${direction}`);
  const handleStop = () => setLastCommand('Stop command sent');

  return (
    <div className="space-y-6 pb-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {hardwareStatus.map((item) => (
          <StatusCard
            key={item.key}
            label={item.label}
            connected={item.connected}
            lastUpdate={item.lastUpdate}
            icon={item.icon}
            value={item.value}
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Camera preview</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Live feed</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="btn-secondary" onClick={() => setStreaming((current) => !current)}>
                {streaming ? 'Stop stream' : 'Start stream'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setLastCommand('Snapshot captured')}>
                Capture
              </button>
            </div>
          </div>

          <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(34,211,238,0.12),_transparent_60%)]" />
            <div className="relative z-10 max-w-md space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10 text-cyan-300">
                <Camera size={22} />
              </div>
              <div className="text-lg font-medium text-slate-100">Camera stream unavailable</div>
              <div className="text-sm text-slate-400">{mode === 'demo' ? 'Demo placeholder active. Connect live hardware to restore feed.' : 'Hardware is disconnected.'}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <span className="flex items-center gap-2"><Circle size={10} className="fill-emerald-400 text-emerald-400" />Object detection: active</span>
            <button type="button" className="btn-secondary" onClick={() => setRecording((current) => !current)}>
              {recording ? 'Stop recording' : 'Record'}
            </button>
            <span className="text-xs uppercase tracking-[0.18em] text-cyan-300">{lastCommand}</span>
          </div>
        </div>

        <div className="space-y-6">
          <ControlPad onMove={handleMove} onStop={handleStop} disabled={false} showWarning={false} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Environment map</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Current map preview</h2>
            </div>
            <Link to="/mapping" className="inline-flex items-center gap-2 text-sm text-cyan-300">
              Open map <ArrowRight size={14} />
            </Link>
          </div>
          <div className="h-[240px] overflow-hidden rounded-xl border border-slate-800">
            <MapCanvas
              robotPosition={mappingSample.robotPosition}
              obstacles={mappingSample.obstacles}
              sensorDistance={mappingSample.sensorDistance}
              scanAngle={mappingSample.scanAngle}
            />
          </div>
        </div>

        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">AI companion</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Latest conversation</h2>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Mic size={14} />
              <span>Listening</span>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            {conversation.map((entry, index) => (
              <div key={`${entry.speaker}-${index}`} className={`rounded-lg p-2 ${entry.speaker === 'robot' ? 'bg-slate-800/80' : 'bg-cyan-500/10'}`}>
                <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">{entry.speaker}</div>
                <div className="text-sm text-slate-200">{entry.text}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input type="text" placeholder="Quick message" className="input-field flex-1" />
            <button type="button" className="btn-primary">Send</button>
          </div>
        </div>
      </div>

      <div className="dark-panel rounded-2xl border border-slate-800 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">System activity</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Recent events</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300"><ShieldCheck size={14} /> Operational</div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {activityFeed.map((item, index) => (
            <div key={`${item.label}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-400">
                <span>{item.type}</span>
                <span>{item.time}</span>
              </div>
              <div className="mb-2 flex items-center gap-2 text-sm text-white">
                {item.type === 'command' ? <SlidersHorizontal size={14} /> : item.type === 'sensor' ? <Gauge size={14} /> : item.type === 'object' ? <Radar size={14} /> : <MessageSquareText size={14} />}
                {item.label}
              </div>
              <div className="text-sm text-slate-300">{item.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
