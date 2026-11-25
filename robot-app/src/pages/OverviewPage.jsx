import { ArrowRight, Circle, Gauge, MessageSquareText, Mic, Radar, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ControlPad from '../components/ControlPad';
import LiveCameraFeed from '../components/LiveCameraFeed';
import MapCanvas from '../components/MapCanvas';
import StatusCard from '../components/StatusCard';
import { activityFeed, conversation, hardwareStatus, mappingSample } from '../data/demoData';
import { useRobot } from '../context/RobotContext';
import useRobotMovement from '../hooks/useRobotMovement';
import { getMapState } from '../services/mappingService';

const emptyMap = {
  robotPosition: { x: 0, y: 0 },
  obstacles: [],
  sensorDistance: 'N/A',
  scanAngle: 0,
};

export default function OverviewPage() {
  const { mode } = useRobot();
  const movement = useRobotMovement();
  const [liveMapState, setLiveMapState] = useState(emptyMap);
  const [mapError, setMapError] = useState('');
  const mapState = mode === 'live' ? liveMapState : mappingSample;

  useEffect(() => {
    if (mode !== 'live') return undefined;

    let active = true;
    let timer;

    const refreshMap = async () => {
      try {
        const nextMap = await getMapState('live');
        if (active) {
          setLiveMapState(nextMap);
          setMapError('');
        }
      } catch (error) {
        if (active) setMapError(error.message);
      } finally {
        if (active) timer = window.setTimeout(refreshMap, 1000);
      }
    };

    refreshMap();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [mode]);

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
              <h2 className="mt-1 text-xl font-semibold text-white">Always-on live feed</h2>
            </div>
          </div>

          <LiveCameraFeed />

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
            <span className="flex items-center gap-2"><Circle size={10} className="fill-cyan-400 text-cyan-400" />Camera refreshes independently of the TFT preview timer</span>
          </div>
        </div>

        <div className="space-y-6">
          <ControlPad
            onMove={movement.handleMove}
            onStop={movement.handleStop}
            disabled={!movement.liveMode || movement.pending}
            showWarning={false}
          />
          {!movement.liveMode && <p className="text-xs text-amber-200">Select Live mode in the top bar to control the robot.</p>}
          {movement.error && <p role="alert" className="text-sm text-rose-300">{movement.error}</p>}
          <p className="text-xs text-slate-400">Last command: {movement.lastCommand}</p>
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
              robotPosition={mapState.robotPosition}
              obstacles={mapState.obstacles}
              sensorDistance={mapState.sensorDistance}
              scanAngle={mapState.scanAngle}
            />
          </div>
          {mapError && <p role="alert" className="mt-2 text-xs text-rose-300">{mapError}</p>}
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
