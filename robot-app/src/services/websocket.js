export function connectRobotSocket(onMessage, mode = 'demo') {
  if (mode === 'demo') {
    const interval = setInterval(() => {
      onMessage({
        type: 'demo',
        timestamp: new Date().toISOString(),
        message: 'Demo telemetry is active.',
      });
    }, 15000);

    return () => clearInterval(interval);
  }

  return () => {};
}
