import { Camera, CheckCircle2, Cpu, Mic, Volume2, Wifi, Zap } from 'lucide-react';
import { useState } from 'react';

export default function SettingsPage() {
  const [cameraSettings, setCameraSettings] = useState({ resolution: '1280x720', streamMode: 'Adaptive', snapshotMode: 'Manual' });
  const [audioSettings, setAudioSettings] = useState({ micEnabled: true, speakerEnabled: true, volume: 64 });
  const [motorSettings, setMotorSettings] = useState({ speedLimit: 78, mode: 'Manual', safetyThreshold: 42 });
  const [sensorSettings, setSensorSettings] = useState({ status: 'Enabled', threshold: 42, servoFuture: 'Pending installation' });
  const [aiSettings, setAiSettings] = useState({ backendUrl: 'http://localhost:8000', status: 'Demo placeholder', voicePreference: 'Natural' });
  const [networkSettings, setNetworkSettings] = useState({ esp32Ip: '192.168.1.18', camIp: '192.168.1.19', backendApi: 'http://localhost:8000' });
  const [savedNotice, setSavedNotice] = useState('No changes yet');

  const updateCamera = (field, value) => setCameraSettings((current) => ({ ...current, [field]: value }));
  const updateAudio = (field, value) => setAudioSettings((current) => ({ ...current, [field]: value }));
  const updateMotor = (field, value) => setMotorSettings((current) => ({ ...current, [field]: value }));
  const updateSensor = (field, value) => setSensorSettings((current) => ({ ...current, [field]: value }));
  const updateAi = (field, value) => setAiSettings((current) => ({ ...current, [field]: value }));
  const updateNetwork = (field, value) => setNetworkSettings((current) => ({ ...current, [field]: value }));

  const saveSettings = () => setSavedNotice('Settings saved to demo session');

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
        <span>{savedNotice}</span>
        <button type="button" className="btn-primary" onClick={saveSettings}>Save profile</button>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400"><Camera size={14} /> Camera</div>
          <div className="space-y-3">
            <label className="block text-sm text-slate-300">Resolution
              <select value={cameraSettings.resolution} onChange={(event) => updateCamera('resolution', event.target.value)} className="input-field mt-2">
                <option value="640x480">640x480</option>
                <option value="1280x720">1280x720</option>
                <option value="1920x1080">1920x1080</option>
              </select>
            </label>
            <label className="block text-sm text-slate-300">Stream settings
              <input value={cameraSettings.streamMode} onChange={(event) => updateCamera('streamMode', event.target.value)} className="input-field mt-2" />
            </label>
            <label className="block text-sm text-slate-300">Snapshot settings
              <input value={cameraSettings.snapshotMode} onChange={(event) => updateCamera('snapshotMode', event.target.value)} className="input-field mt-2" />
            </label>
          </div>
        </div>

        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400"><Volume2 size={14} /> Audio</div>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
              <span>Microphone enabled</span>
              <button type="button" onClick={() => updateAudio('micEnabled', !audioSettings.micEnabled)} className={`toggle ${audioSettings.micEnabled ? 'on' : ''}`} aria-label="Toggle microphone">
                <span />
              </button>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
              <span>Speaker enabled</span>
              <button type="button" onClick={() => updateAudio('speakerEnabled', !audioSettings.speakerEnabled)} className={`toggle ${audioSettings.speakerEnabled ? 'on' : ''}`} aria-label="Toggle speaker">
                <span />
              </button>
            </div>
            <label className="block text-sm text-slate-300">Volume
              <input type="range" min="0" max="100" value={audioSettings.volume} onChange={(event) => updateAudio('volume', Number(event.target.value))} className="mt-3 w-full accent-cyan-400" />
            </label>
          </div>
        </div>

        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400"><Zap size={14} /> Motors</div>
          <div className="space-y-3">
            <label className="block text-sm text-slate-300">Speed limit
              <input value={motorSettings.speedLimit} onChange={(event) => updateMotor('speedLimit', Number(event.target.value))} className="input-field mt-2" />
            </label>
            <label className="block text-sm text-slate-300">Movement mode
              <input value={motorSettings.mode} onChange={(event) => updateMotor('mode', event.target.value)} className="input-field mt-2" />
            </label>
            <label className="block text-sm text-slate-300">Safety threshold
              <input value={motorSettings.safetyThreshold} onChange={(event) => updateMotor('safetyThreshold', Number(event.target.value))} className="input-field mt-2" />
            </label>
          </div>
        </div>

        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400"><Cpu size={14} /> Sensors</div>
          <div className="space-y-3">
            <label className="block text-sm text-slate-300">HC-SR04 status
              <input value={sensorSettings.status} onChange={(event) => updateSensor('status', event.target.value)} className="input-field mt-2" />
            </label>
            <label className="block text-sm text-slate-300">Obstacle threshold
              <input value={sensorSettings.threshold} onChange={(event) => updateSensor('threshold', Number(event.target.value))} className="input-field mt-2" />
            </label>
            <label className="block text-sm text-slate-300">Future servo scanning config
              <input value={sensorSettings.servoFuture} onChange={(event) => updateSensor('servoFuture', event.target.value)} className="input-field mt-2" />
            </label>
          </div>
        </div>

        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400"><CheckCircle2 size={14} /> AI</div>
          <div className="space-y-3">
            <label className="block text-sm text-slate-300">Qwen backend URL
              <input value={aiSettings.backendUrl} onChange={(event) => updateAi('backendUrl', event.target.value)} className="input-field mt-2" />
            </label>
            <label className="block text-sm text-slate-300">AI connection status
              <input value={aiSettings.status} onChange={(event) => updateAi('status', event.target.value)} className="input-field mt-2" />
            </label>
            <label className="block text-sm text-slate-300">Voice interaction preferences
              <input value={aiSettings.voicePreference} onChange={(event) => updateAi('voicePreference', event.target.value)} className="input-field mt-2" />
            </label>
          </div>
        </div>

        <div className="dark-panel rounded-2xl border border-slate-800 p-4">
          <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400"><Wifi size={14} /> Network</div>
          <div className="space-y-3">
            <label className="block text-sm text-slate-300">ESP32 IP
              <input value={networkSettings.esp32Ip} onChange={(event) => updateNetwork('esp32Ip', event.target.value)} className="input-field mt-2" />
            </label>
            <label className="block text-sm text-slate-300">ESP32-CAM IP
              <input value={networkSettings.camIp} onChange={(event) => updateNetwork('camIp', event.target.value)} className="input-field mt-2" />
            </label>
            <label className="block text-sm text-slate-300">Backend API URL
              <input value={networkSettings.backendApi} onChange={(event) => updateNetwork('backendApi', event.target.value)} className="input-field mt-2" />
            </label>
            <div className="flex gap-2">
              <button type="button" className="btn-primary" onClick={() => setSavedNotice('Connection test initiated')}>Test connection</button>
              <button type="button" className="btn-secondary" onClick={saveSettings}>Save</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
