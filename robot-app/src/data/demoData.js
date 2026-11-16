export const robotMeta = {
  id: 'NEXUS-01',
  brand: 'NEXUS ROBOTICS',
  title: 'Overview',
};

export const hardwareStatus = [
  { key: 'esp32', label: 'ESP32 Controller', connected: true, lastUpdate: '2 sec ago', icon: 'Cpu', value: 'Connected' },
  { key: 'cam', label: 'ESP32-CAM', connected: true, lastUpdate: '1 sec ago', icon: 'Camera', value: 'Stream active' },
  { key: 'qwen', label: 'Qwen AI Engine', connected: false, lastUpdate: '3 min ago', icon: 'Bot', value: 'Demo placeholder' },
  { key: 'motors', label: 'Motor Driver', connected: true, lastUpdate: '5 sec ago', icon: 'Gauge', value: 'Ready' },
  { key: 'mic', label: 'Microphone', connected: true, lastUpdate: '8 sec ago', icon: 'Mic', value: 'Listening' },
  { key: 'speaker', label: 'Speaker', connected: true, lastUpdate: '14 sec ago', icon: 'Volume2', value: 'Idle' },
  { key: 'ultrasonic', label: 'Ultrasonic Sensor', connected: true, lastUpdate: '1 sec ago', icon: 'Radar', value: 'Forward scan' },
];

export const activityFeed = [
  { type: 'command', label: 'MOVE_FORWARD', detail: 'Motor command queued', time: 'Just now' },
  { type: 'sensor', label: 'ULTRASONIC', detail: 'Obstacle threshold: 42 cm', time: '12 sec ago' },
  { type: 'object', label: 'OBJECT', detail: 'Detected: workstation chair', time: '22 sec ago' },
  { type: 'connection', label: 'CAMERA', detail: 'Stream resumed from demo session', time: '1 min ago' },
];

export const conversation = [
  { speaker: 'robot', text: 'Good morning. I am ready to assist with navigation and monitoring.', time: '09:41' },
  { speaker: 'user', text: 'What is the current path clearance ahead?', time: '09:42' },
  { speaker: 'robot', text: 'Forward clearance is approximately 78 cm in demo mode. I recommend a cautious approach.', time: '09:42' },
];

export const detectionHistory = [
  { id: 1, name: 'Chair', confidence: 92, timestamp: '09:43:12' },
  { id: 2, name: 'Desk', confidence: 86, timestamp: '09:43:19' },
  { id: 3, name: 'Person', confidence: 77, timestamp: '09:43:32' },
];

export const distanceHistory = [
  { time: '00:00', distance: 82 },
  { time: '00:05', distance: 76 },
  { time: '00:10', distance: 64 },
  { time: '00:15', distance: 58 },
  { time: '00:20', distance: 71 },
  { time: '00:25', distance: 88 },
  { time: '00:30', distance: 79 },
];

export const motorStatuses = [
  { motor: 'Front Left', status: 'Online', power: '72%' },
  { motor: 'Front Right', status: 'Online', power: '69%' },
  { motor: 'Rear Left', status: 'Online', power: '74%' },
  { motor: 'Rear Right', status: 'Online', power: '70%' },
];

export const movementHistory = [
  { direction: 'Forward', status: 'Executed', time: '09:41' },
  { direction: 'Left', status: 'Executed', time: '09:36' },
  { direction: 'Stop', status: 'Emergency-safe', time: '09:21' },
];

export const scanHistory = ['0°', '12°', '28°', '45°', '62°'];

export const mappingSample = {
  robotPosition: { x: 0, y: 0 },
  scanAngle: 18,
  sensorDistance: 74,
  obstacles: [
    { x: 42, y: 52 },
    { x: 68, y: 60 },
    { x: 94, y: 42 },
    { x: 108, y: 30 },
    { x: 44, y: -18 },
  ],
  boundarySegments: [
    { x1: 32, y1: 48, x2: 58, y2: 62 },
    { x1: 58, y1: 62, x2: 90, y2: 44 },
  ],
};
