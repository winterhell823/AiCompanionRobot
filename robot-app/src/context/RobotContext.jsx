import { createContext, useContext, useMemo, useState } from 'react';

const RobotContext = createContext(null);

export function RobotProvider({ children }) {
  const [mode, setMode] = useState('demo');
  const [backendUrl, setBackendUrl] = useState('http://localhost:8000');
  const [isConnected, setIsConnected] = useState(false);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      backendUrl,
      setBackendUrl,
      isConnected,
      setIsConnected,
    }),
    [backendUrl, isConnected, mode],
  );

  return <RobotContext.Provider value={value}>{children}</RobotContext.Provider>;
}

export function useRobot() {
  const context = useContext(RobotContext);

  if (!context) {
    throw new Error('useRobot must be used within RobotProvider');
  }

  return context;
}
