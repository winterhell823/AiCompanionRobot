import { Activity, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Radio, ShieldAlert, Zap } from 'lucide-react';
import { useState } from 'react';
import ControlPad from '../components/ControlPad';
import { useRobot } from '../context/RobotContext';
import { motorStatuses, movementHistory } from '../data/demoData';
import useRobotMovement from '../hooks/useRobotMovement';

export default function MovementPage() {
  const [speed, setSpeed] = useState(68);
  const [manualMode, setManualMode] = useState(true);
  const [warning] = useState(true);
  const { mode } = useRobot();
  const movement = useRobotMovement(speed);

  return (
    <div className="space-y-6 pb-8">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div>
          <ControlPad
            onMove={movement.handleMove}
            onStop={movement.handleStop}
            disabled={!movement.liveMode || movement.pending}
            showWarning={warning}
          />
          {!movement.liveMode && <p className="mt-2 text-xs text-amber-200">Select Live mode in the top bar to control the robot.</p>}
          {movement.error && <p role="alert" className="mt-2 text-sm text-rose-300">{movement.error}</p>}
        </div>

        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Drive settings</div>
              <h2 className="mt-1 text-xl font-semibold text-white">Movement profile</h2>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-300">
              {manualMode ? 'Manual mode' : 'Autonomous mode'}
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-sm text-slate-300">
              Motor speed: {speed}%
              <input type="range" min="0" max="100" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="mt-3 w-full accent-cyan-400" />
            </label>

            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
              <span>Manual / Autonomous</span>
              <button type="button" onClick={() => setManualMode((current) => !current)} className={`toggle ${manualMode ? 'on' : ''}`} aria-label="Toggle movement mode">
                <span />
              </button>
            </div>

            <button type="button" onClick={movement.handleStop} className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-200">
              <Zap size={16} /> Emergency stop
            </button>
            <p className="text-xs text-slate-400">
              {mode === 'live'
                ? 'Each direction click sends a timed command; the current firmware does not support motor speed percentages.'
                : 'Switch to Live mode to send commands to the robot.'}
            </p>

            {warning && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                <ShieldAlert size={16} className="mt-0.5" />
                Obstacle data indicates a nearby obstruction. Front clearance is below the recommended safety threshold.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dark-panel rounded-2xl border border-slate-800 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Motor status</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Four motor channels</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-300"><Activity size={14} /> {movement.lastCommand}</div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {motorStatuses.map((motor) => (
            <div key={motor.motor} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-white">{motor.motor}</span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-emerald-300">{motor.status}</span>
              </div>
              <div className="text-2xl font-semibold text-slate-100">{motor.power}</div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: motor.power }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="dark-panel rounded-2xl border border-slate-800 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Movement history</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Recent commands</h2>
          </div>
        </div>
        <div className="space-y-3">
          {movementHistory.map((entry, index) => (
            <div key={`${entry.direction}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
              <div className="flex items-center gap-2">
                {entry.direction === 'Forward' && <ArrowUp size={14} />}
                {entry.direction === 'Left' && <ArrowLeft size={14} />}
                {entry.direction === 'Right' && <ArrowRight size={14} />}
                {entry.direction === 'Backward' && <ArrowDown size={14} />}
                {entry.direction === 'Stop' && <Radio size={14} />}
                {entry.direction}
              </div>
              <div className="text-slate-400">{entry.status}</div>
              <div className="text-slate-400">{entry.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
