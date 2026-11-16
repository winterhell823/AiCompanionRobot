import { apiRequest } from './api';
import { hardwareStatus } from '../data/demoData';

export async function getRobotStatus(mode = 'demo') {
  if (mode === 'demo') {
    return { online: true, mode: 'demo', components: hardwareStatus };
  }

  return apiRequest({
    url: '/api/robot/status',
    fallback: { online: false, mode: 'live', components: [] },
  });
}

export async function moveRobot(direction, speed = 60, mode = 'demo') {
  if (mode === 'demo') {
    return { success: true, direction, speed, message: `Demo movement command: ${direction}` };
  }

  return apiRequest({
    url: '/api/robot/move',
    method: 'POST',
    data: { direction, speed },
    fallback: { success: false, message: 'Integration required: robot move endpoint is not connected.' },
  });
}

export async function stopRobot(mode = 'demo') {
  if (mode === 'demo') {
    return { success: true, message: 'Demo stop command acknowledged.' };
  }

  return apiRequest({
    url: '/api/robot/stop',
    method: 'POST',
    fallback: { success: false, message: 'Integration required: robot stop endpoint is not connected.' },
  });
}
