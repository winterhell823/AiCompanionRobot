import { apiRequest } from './api';
import { distanceHistory } from '../data/demoData';

export async function getDistanceReading(mode = 'demo') {
  if (mode === 'demo') {
    return {
      distanceCm: 74,
      unit: 'cm',
      obstacleDetected: true,
      timestamp: 'Just now',
      sample: true,
    };
  }

  return apiRequest({
    url: '/api/sensors/distance',
    fallback: { distanceCm: 'N/A', obstacleDetected: false, timestamp: 'N/A' },
  });
}

export async function getSensorHistory(mode = 'demo') {
  if (mode === 'demo') {
    return distanceHistory;
  }

  return apiRequest({
    url: '/api/sensors/history',
    fallback: [],
  });
}
