import { useEffect, useState } from 'react';
import { Compass, MapPinned, Pause, Play, Radar, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import MapCanvas from '../components/MapCanvas';
import { useRobot } from '../context/RobotContext';
import { mappingSample, scanHistory } from '../data/demoData';
import { getMapState, pauseMapping, resetMapping, startMapping } from '../services/mappingService';

const emptyMap = {
  robotPosition: { x: 0, y: 0 },
  obstacles: [],
  sensorDistance: 'N/A',
  scanAngle: 0,
  active: false,
};

export default function MappingPage() {
  const { mode } = useRobot();
  const [gridEnabled, setGridEnabled] = useState(true);
  const [labelsEnabled, setLabelsEnabled] = useState(true);
  const [sensorVisible, setSensorVisible] = useState(true);
  const [liveMapState, setLiveMapState] = useState(emptyMap);
  const [mapError, setMapError] = useState('');
  const [busy, setBusy] = useState(false);
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

  const runMappingAction = async (action) => {
    if (mode !== 'live') {
      setMapError('Select Live mode in the top bar to collect sensor points.');
      return;
    }

    setBusy(true);
    setMapError('');
    try {
      const result = await action('live');
      if (!result.success) throw new Error(result.message || 'Mapping request failed.');
      if (action === resetMapping) {
        setLiveMapState((current) => ({ ...current, obstacles: [], active: false }));
      } else {
        setLiveMapState((current) => ({ ...current, active: action === startMapping }));
      }
    } catch (error) {
      setMapError(error.message || 'Mapping request failed.');
    } finally {
      setBusy(false);
    }
  };

  const isLive = mode === 'live';
  const hasSensorReading = Number.isFinite(Number(mapState.sensorDistance));
  const status = isLive
    ? (mapState.active ? 'Mapping active' : 'Paused')
    : 'Demo sample';
  const visibleHistory = isLive
    ? mapState.obstacles.slice(-5).map((point) => `${point.x} cm`)
    : scanHistory;

  return (
    <div className="space-y-6 pb-8">
      <div className="dark-panel rounded-2xl border border-slate-800 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Navigation map</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Ultrasonic obstacle map</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary" disabled={!isLive || busy} onClick={() => runMappingAction(startMapping)}><Play size={14} /> Start</button>
            <button type="button" className="btn-secondary" disabled={!isLive || busy} onClick={() => runMappingAction(pauseMapping)}><Pause size={14} /> Pause</button>
            <button type="button" className="btn-secondary" disabled={!isLive || busy} onClick={() => runMappingAction(resetMapping)}><RotateCcw size={14} /> Reset</button>
          </div>
        </div>

        {!isLive && <p className="mb-4 text-sm text-amber-200">Switch to Live mode to map current distance readings.</p>}
        {mapError && <p role="alert" className="mb-4 text-sm text-rose-300">{mapError}</p>}

        <div className="grid gap-6 xl:grid-cols-[1.6fr_0.7fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2"><MapPinned size={14} /> Map view</div>
              <div>{mapState.updatedAt ? `Updated ${new Date(mapState.updatedAt).toLocaleTimeString()}` : 'Waiting for readings'}</div>
            </div>
            <div className="h-[520px]">
              <MapCanvas
                robotPosition={mapState.robotPosition}
                obstacles={mapState.obstacles}
                sensorDistance={mapState.sensorDistance}
                scanAngle={mapState.scanAngle}
                showGrid={gridEnabled}
                showLabels={labelsEnabled}
                showSensor={sensorVisible && hasSensorReading}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="dark-panel rounded-2xl border border-slate-800 p-4">
              <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-400">Map controls</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-secondary"><ZoomIn size={14} /> Zoom in</button>
                <button type="button" className="btn-secondary"><ZoomOut size={14} /> Zoom out</button>
                <button type="button" className="btn-secondary" onClick={() => setGridEnabled((current) => !current)}>{gridEnabled ? 'Hide grid' : 'Show grid'}</button>
                <button type="button" className="btn-secondary" onClick={() => setLabelsEnabled((current) => !current)}>{labelsEnabled ? 'Hide labels' : 'Show labels'}</button>
                <button type="button" className="btn-secondary" onClick={() => setSensorVisible((current) => !current)}>{sensorVisible ? 'Hide sensor' : 'Show sensor'}</button>
                <button type="button" className="btn-secondary"><Compass size={14} /> Fit map</button>
              </div>
            </div>

            <div className="dark-panel rounded-2xl border border-slate-800 p-4">
              <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-400">Legend</div>
              <ul className="space-y-2 text-sm text-slate-200">
                <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-blue-500" /> Blue: robot</li>
                <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-orange-500" /> Orange: measured obstacle point</li>
              </ul>
            </div>

            <div className="dark-panel rounded-2xl border border-slate-800 p-4">
              <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-400">Map details</div>
              <div className="space-y-3 text-sm text-slate-200">
                <div className="flex items-center justify-between"><span>Current distance</span><span className="text-cyan-300">{hasSensorReading ? `${mapState.sensorDistance} cm` : 'Unavailable'}</span></div>
                <div className="flex items-center justify-between"><span>Sensor status</span><span className={hasSensorReading ? 'text-emerald-300' : 'text-rose-300'}>{hasSensorReading ? 'Active' : 'Unavailable'}</span></div>
                <div className="flex items-center justify-between"><span>Points</span><span>{mapState.obstacles.length}</span></div>
                <div className="flex items-center justify-between"><span>Mapping status</span><span>{status}</span></div>
              </div>
              <p className="mt-3 text-xs text-slate-400">Dots plot forward sensor distances only; the robot has no position or rotation odometry.</p>
            </div>

            <div className="dark-panel rounded-2xl border border-slate-800 p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400"><Radar size={14} /> Recent distance samples</div>
              <div className="flex flex-wrap gap-2">
                {visibleHistory.length
                  ? visibleHistory.map((sample, index) => (
                    <span key={`${sample}-${index}`} className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">{sample}</span>
                  ))
                  : <span className="text-xs text-slate-400">No obstacle points recorded yet.</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
