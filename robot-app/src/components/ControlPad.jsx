import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Octagon, Zap } from 'lucide-react';

export default function ControlPad({ onMove, onStop, disabled = false, showWarning = false }) {
  return (
    <div className="dark-panel rounded-xl border border-slate-800 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Movement control</div>
          <div className="mt-1 text-lg font-semibold text-white">Directional pad</div>
        </div>
        {showWarning && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-200">
            Obstruction warning
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onMove('forward')}
          className="control-button"
        >
          <ArrowUp size={18} />
          Forward
        </button>
        <div />

        <button
          type="button"
          disabled={disabled}
          onClick={() => onMove('left')}
          className="control-button"
        >
          <ArrowLeft size={18} />
          Left
        </button>

        <button
          type="button"
          onClick={onStop}
          className="control-button bg-rose-500/10 text-rose-200 ring-1 ring-rose-500/30"
        >
          <Octagon size={18} />
          Stop
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onMove('right')}
          className="control-button"
        >
          <ArrowRight size={18} />
          Right
        </button>

        <div />
        <button
          type="button"
          disabled={disabled}
          onClick={() => onMove('backward')}
          className="control-button"
        >
          <ArrowDown size={18} />
          Backward
        </button>
        <div />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={onStop} className="inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200">
          <Zap size={14} /> Emergency stop
        </button>
      </div>
    </div>
  );
}
