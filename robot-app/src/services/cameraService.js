import { apiRequest } from './api';

export async function getCameraStatus(mode = 'demo') {
  if (mode === 'demo') {
    return {
      connected: true,
      streamActive: true,
      resolution: '1280x720',
      objectDetectionEnabled: true,
      status: 'Demo stream available',
    };
  }

  return apiRequest({
    url: '/api/camera/status',
    fallback: { connected: false, streamActive: false, resolution: 'N/A', status: 'Integration required.' },
  });
}

export async function getCameraStream(mode = 'demo') {
  if (mode === 'demo') {
    return { url: null, demo: true, placeholder: true };
  }

  return apiRequest({
    url: '/api/camera/stream',
    fallback: { url: null, status: 'Integration required.' },
  });
}
