import { useCallback, useState } from 'react';
import { useRobot } from '../context/RobotContext';
import { sendMovementCommand, stopMovement } from '../services/movementService';

export default function useRobotMovement(speed = 60) {
  const { mode } = useRobot();
  const [pending, setPending] = useState(false);
  const [lastCommand, setLastCommand] = useState('Idle');
  const [error, setError] = useState('');
  const liveMode = mode === 'live';

  const handleMove = useCallback(async (direction) => {
    if (!liveMode) {
      setError('Select Live mode in the top bar to control the robot.');
      return;
    }

    setPending(true);
    setError('');
    try {
      const result = await sendMovementCommand({ direction, speed, mode });
      if (!result.success) throw new Error(result.message || 'Movement command failed.');
      setLastCommand(`Move ${direction}`);
    } catch (requestError) {
      setError(requestError.message || 'Movement command failed.');
    } finally {
      setPending(false);
    }
  }, [liveMode, mode, speed]);

  const handleStop = useCallback(async () => {
    if (!liveMode) {
      setError('Select Live mode in the top bar to send a stop command.');
      return;
    }

    setPending(true);
    setError('');
    try {
      const result = await stopMovement(mode);
      if (!result.success) throw new Error(result.message || 'Stop command failed.');
      setLastCommand('Stop command sent');
    } catch (requestError) {
      setError(requestError.message || 'Stop command failed.');
    } finally {
      setPending(false);
    }
  }, [liveMode, mode]);

  return { liveMode, pending, lastCommand, error, handleMove, handleStop };
}
