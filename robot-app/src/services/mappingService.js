import { apiRequest } from './api';
import { mappingSample } from '../data/demoData';

export async function getMapState(mode = 'demo') {
  if (mode === 'demo') {
    return mappingSample;
  }

  return apiRequest({
    url: '/api/mapping/map',
  });
}

export async function startMapping(mode = 'demo') {
  if (mode === 'demo') {
    return { success: true, message: 'Demo mapping started.' };
  }

  return apiRequest({
    url: '/api/mapping/start',
    method: 'POST',
  });
}

export async function pauseMapping(mode = 'demo') {
  if (mode === 'demo') {
    return { success: true, message: 'Demo mapping paused.' };
  }

  return apiRequest({
    url: '/api/mapping/pause',
    method: 'POST',
  });
}

export async function resetMapping(mode = 'demo') {
  if (mode === 'demo') {
    return { success: true, message: 'Demo map reset.' };
  }

  return apiRequest({
    url: '/api/mapping/reset',
    method: 'POST',
  });
}
