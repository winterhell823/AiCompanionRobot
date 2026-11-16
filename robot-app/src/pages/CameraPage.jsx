import { Camera, CameraIcon, Circle, Pause, Play, ScanLine } from 'lucide-react';
import { useState } from 'react';
import { detectionHistory } from '../data/demoData';

export default function CameraPage() {
  const [isStreaming, setIsStreaming] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [objectDetectionEnabled, setObjectDetectionEnabled] = useState(true);
  const [resolution, setResolution] = useState('1280x720');

  return (
    <div className="space-y-6 pb-8">
      <div className="dark-panel rounded-2xl border border-slate-800 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Vision system</div>
            <h2 className="mt-1 text-xl font-semibold text-white">ESP32-CAM monitor</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary" onClick={() => setIsStreaming((current) => !current)}>
              {isStreaming ? 'Stop stream' : 'Start stream'}
            </button>
            <button type="button" className="btn-secondary">Capture image</button>
            <button type="button" className="btn-secondary" onClick={() => setIsRecording((current) => !current)}>
              {isRecording ? 'Stop recording' : 'Record'}
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.7fr_0.9fr]">
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.10),_rgba(2,6,23,0.90)_65%)]" />
            <div className="relative flex min-h-[420px] items-center justify-center">
              {isStreaming ? (
                <div className="relative h-full w-full p-6">
                  <div className="float-right mb-4 flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-200">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" /> Live feed
                  </div>
                  <div className="relative h-[280px] overflow-hidden rounded-xl border border-slate-700 bg-slate-900/80">
                    <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(148,163,184,0.12),transparent)]" />
                    <div className="absolute left-10 top-10 h-20 w-20 rounded-lg border-2 border-dashed border-slate-500/60" />
                    <div className="absolute right-12 top-16 h-24 w-24 rounded-full border border-cyan-400/30" />
                    <div className="absolute bottom-14 left-16 h-28 w-40 rounded-md border border-emerald-400/30 bg-emerald-500/5" />
                    <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" />
                    <div className="absolute bottom-24 left-20 h-16 w-16 rounded-full border-2 border-amber-400 bg-amber-500/10" />
                    <div className="absolute bottom-18 left-40 h-8 w-20 rounded border-2 border-pink-400 bg-pink-500/10" />
                    <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-300/70" />
                    <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/30" />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                    <span>Bounding boxes: active</span>
                    <span>Resolution: {resolution}</span>
                  </div>
                </div>
              ) : (
                <div className="max-w-md space-y-4 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300">
                    <CameraIcon size={28} />
                  </div>
                  <div className="text-xl font-semibold text-slate-100">Camera disconnected</div>
                  <div className="text-sm text-slate-400">No live stream is available. Connect the ESP32-CAM or open demo mode to inspect the camera control panel.</div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-400">Controls</div>
              <div className="space-y-3">
                <label className="block text-sm text-slate-300">
                  Resolution
                  <select value={resolution} onChange={(event) => setResolution(event.target.value)} className="input-field mt-2">
                    <option value="640x480">640x480</option>
                    <option value="1280x720">1280x720</option>
                    <option value="1920x1080">1920x1080</option>
                  </select>
                </label>
                <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200">
                  <span>Object detection</span>
                  <button type="button" onClick={() => setObjectDetectionEnabled((current) => !current)} className={`toggle ${objectDetectionEnabled ? 'on' : ''}`} aria-label="Toggle object detection">
                    <span />
                  </button>
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Detection results</div>
                <div className="flex items-center gap-2 text-xs text-slate-300"><ScanLine size={14} /> {objectDetectionEnabled ? 'Active' : 'Paused'}</div>
              </div>
              <div className="space-y-3">
                {detectionHistory.map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-white">{entry.name}</div>
                      <div className="text-xs text-cyan-300">{entry.confidence}%</div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                      <span>Status: detected</span>
                      <span>{entry.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
