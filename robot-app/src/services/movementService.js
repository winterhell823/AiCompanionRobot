import { apiRequest } from './api';

export async function sendMovementCommand({ direction, speed = 60, mode = 'demo' }) {
  if (mode === 'demo') {
    return {
      success: true,
      direction,
      speed,
      message: `Demo movement: ${direction} at ${speed}%`,
    };
  }

  return apiRequest({
    url: '/api/robot/move',
    method: 'POST',
    data: { direction, speed },
    fallback: { success: false, message: 'Integration required: movement backend unavailable.' },
  });
}

export async function stopMovement(mode = 'demo') {
  if (mode === 'demo') {
    return { success: true, message: 'Demo emergency stop acknowledged.' };
  }

  return apiRequest({
    url: '/api/robot/stop',
    method: 'POST',
    fallback: { success: false, message: 'Integration required: stop endpoint unavailable.' },
  });
}
