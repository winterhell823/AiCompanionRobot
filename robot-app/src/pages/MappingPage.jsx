import { useState } from 'react';
import { Compass, Layers3, MapPinned, Pause, Play, Radar, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import MapCanvas from '../components/MapCanvas';
import { mappingSample, scanHistory } from '../data/demoData';

export default function MappingPage() {
  const [gridEnabled, setGridEnabled] = useState(true);
  const [labelsEnabled, setLabelsEnabled] = useState(true);
  const [sensorVisible, setSensorVisible] = useState(true);
  const [status, setStatus] = useState('Mapping active');

  return (
    <div className="space-y-6 pb-8">
      <div className="dark-panel rounded-2xl border border-slate-800 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Navigation map</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Ultrasonic boundary map</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary" onClick={() => setStatus('Mapping active')}><Play size={14} /> Start</button>
            <button type="button" className="btn-secondary" onClick={() => setStatus('Paused')}><Pause size={14} /> Pause</button>
            <button type="button" className="btn-secondary"><RotateCcw size={14} /> Reset</button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.6fr_0.7fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2"><MapPinned size={14} /> Map view</div>
              <div>Last update: 1 sec ago</div>
            </div>
            <div className="h-[520px]">
              <MapCanvas
                robotPosition={mappingSample.robotPosition}
                obstacles={mappingSample.obstacles}
                sensorDistance={mappingSample.sensorDistance}
                scanAngle={mappingSample.scanAngle}
                showGrid={gridEnabled}
                showLabels={labelsEnabled}
                showSensor={sensorVisible}
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
                <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-slate-100" /> White: walls / boundaries</li>
                <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-orange-500" /> Orange: detected obstacles</li>
                <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-slate-500" /> Grey: explored space</li>
                <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-slate-900" /> Dark: unexplored region</li>
              </ul>
            </div>

            <div className="dark-panel rounded-2xl border border-slate-800 p-4">
              <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-slate-400">Map details</div>
              <div className="space-y-3 text-sm text-slate-200">
                <div className="flex items-center justify-between"><span>Current distance</span><span className="text-cyan-300">{mappingSample.sensorDistance} cm</span></div>
                <div className="flex items-center justify-between"><span>Sensor status</span><span className="text-emerald-300">Active</span></div>
                <div className="flex items-center justify-between"><span>Points</span><span>{mappingSample.obstacles.length}</span></div>
                <div className="flex items-center justify-between"><span>Mapping status</span><span>{status}</span></div>
              </div>
            </div>

            <div className="dark-panel rounded-2xl border border-slate-800 p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-slate-400"><Radar size={14} /> Scan history</div>
              <div className="flex flex-wrap gap-2">
                {scanHistory.map((scan) => (
                  <span key={scan} className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200">{scan}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
