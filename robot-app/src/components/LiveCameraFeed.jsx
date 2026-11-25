import { Camera } from 'lucide-react';
import { useEffect, useState } from 'react';
import { backendBaseUrl } from '../services/api';

export default function LiveCameraFeed({ className = '' }) {
  const [frameUrl, setFrameUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let timer;
    let request;
    let currentFrameUrl = '';
    let retryDelay = 1000;

    const fetchFrame = async () => {
      request = new AbortController();
      retryDelay = 1000;
      try {
        const statusResponse = await fetch(
          `${backendBaseUrl}/api/camera/status`,
          { cache: 'no-store', signal: request.signal },
        );
        if (!statusResponse.ok) {
          throw new Error(`Camera status request failed (${statusResponse.status}).`);
        }
        const cameraStatus = await statusResponse.json();
        if (!cameraStatus.connected) {
          setError(cameraStatus.status || 'Camera is offline.');
          retryDelay = 3000;
          return;
        }

        const response = await fetch(
          `${backendBaseUrl}/api/camera/frame?timestamp=${Date.now()}`,
          { cache: 'no-store', signal: request.signal },
        );
        if (!response.ok) {
          throw new Error(`Camera request failed (${response.status}).`);
        }

        const nextFrameUrl = URL.createObjectURL(await response.blob());
        if (!active) {
          URL.revokeObjectURL(nextFrameUrl);
          return;
        }
        if (currentFrameUrl) URL.revokeObjectURL(currentFrameUrl);
        currentFrameUrl = nextFrameUrl;
        setFrameUrl(nextFrameUrl);
        setError('');
      } catch (requestError) {
        if (active && requestError.name !== 'AbortError') {
          setError(requestError.message || 'Camera is unavailable.');
          retryDelay = 3000;
        }
      } finally {
        if (active) timer = window.setTimeout(fetchFrame, retryDelay);
      }
    };

    fetchFrame();
    return () => {
      active = false;
      window.clearTimeout(timer);
      request?.abort();
      if (currentFrameUrl) URL.revokeObjectURL(currentFrameUrl);
    };
  }, []);

  return (
    <div className={`relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950 ${className}`}>
      {frameUrl ? (
        <img src={frameUrl} alt="Live ESP32 camera feed" className="h-full max-h-[520px] w-full object-contain" />
      ) : (
        <div className="flex flex-col items-center gap-3 p-6 text-center text-slate-400">
          <Camera size={28} className="text-cyan-300" />
          <span>Waiting for the camera feed…</span>
        </div>
      )}
      <div className="absolute left-3 top-3 rounded-full border border-slate-700 bg-slate-950/85 px-3 py-1 text-xs text-slate-200">
        <span className={`mr-2 inline-block h-2 w-2 rounded-full ${error ? 'bg-rose-400' : frameUrl ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        {error ? (frameUrl ? 'Feed interrupted · last frame shown' : 'Camera unavailable') : frameUrl ? 'Live · refreshes every second' : 'Connecting'}
      </div>
      {error && (
        <div className="absolute bottom-3 left-3 right-3 text-center text-xs text-rose-200">{error}</div>
      )}
    </div>
  );
}
