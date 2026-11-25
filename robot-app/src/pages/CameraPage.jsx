import { Camera, ScanLine } from 'lucide-react';
import LiveCameraFeed from '../components/LiveCameraFeed';

export default function CameraPage() {
  return (
    <div className="space-y-6 pb-8">
      <div className="dark-panel rounded-2xl border border-slate-800 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Vision system</div>
            <h2 className="mt-1 text-xl font-semibold text-white">Always-on ESP32-CAM feed</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-cyan-200">
            <Camera size={16} /> Frontend refreshes continuously
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.7fr_0.9fr]">
          <LiveCameraFeed className="min-h-[420px]" />

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                <ScanLine size={14} /> Camera timing
              </div>
              <p className="text-sm text-slate-200">The browser requests a fresh camera frame every second while this page is open.</p>
              <p className="mt-3 text-sm text-slate-400">This is independent of the ESP32 TFT preview, whose 10-second display timer is unchanged.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">Connection</div>
              <p className="text-sm text-slate-300">If no image appears, check that the ESP32-CAM is online and its configured camera endpoint serves JPEG frames.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
