export default function MapCanvas({ robotPosition = { x: 0, y: 0 }, obstacles = [], sensorDistance = 74, scanAngle = 20, showGrid = true, showLabels = true, showSensor = true }) {
  const width = 520;
  const height = 420;
  const centerX = width / 2;
  const centerY = height / 2;
  const scale = 4;

  const robotX = centerX + robotPosition.x * scale;
  const robotY = centerY - robotPosition.y * scale;

  const sensorX = robotX + Math.cos((scanAngle * Math.PI) / 180) * (sensorDistance * 1.2);
  const sensorY = robotY - Math.sin((scanAngle * Math.PI) / 180) * (sensorDistance * 1.2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full rounded-xl bg-slate-950">
      {showGrid && (
        <g opacity="0.18" stroke="#334155">
          {Array.from({ length: 12 }).map((_, index) => (
            <g key={index}>
              <line x1={index * 40} x2={index * 40} y1={0} y2={height} />
              <line x1={0} x2={width} y1={index * 30} y2={index * 30} />
            </g>
          ))}
        </g>
      )}

      <rect x="30" y="30" width={width - 60} height={height - 60} rx="18" fill="#0f172a" stroke="#1e293b" />

      {showSensor && (
        <g>
          <line x1={robotX} y1={robotY} x2={sensorX} y2={sensorY} stroke="#67e8f9" strokeWidth="2" strokeDasharray="6 6" />
          <circle cx={sensorX} cy={sensorY} r="5" fill="#67e8f9" />
          <text x={sensorX + 8} y={sensorY - 8} fill="#67e8f9" fontSize="12">{sensorDistance} cm</text>
        </g>
      )}

      {obstacles.map((obstacle, index) => {
        const px = centerX + obstacle.x * scale;
        const py = centerY - obstacle.y * scale;

        return (
          <g key={`${obstacle.x}-${obstacle.y}-${index}`}>
            <circle cx={px} cy={py} r="6" fill="#f97316" opacity="0.9" />
            {showLabels && <text x={px + 10} y={py - 10} fill="#fdba74" fontSize="11">Obstacle</text>}
          </g>
        );
      })}

      <g>
        <circle cx={robotX} cy={robotY} r={12} fill="#3b82f6" />
        <circle cx={robotX} cy={robotY} r={18} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="6 4" />
        <path d={`M ${robotX} ${robotY} L ${sensorX} ${sensorY}`} stroke="#93c5fd" strokeWidth="2" />
      </g>

      <g>
        <text x="32" y="30" fill="#cbd5e1" fontSize="11">Robot</text>
        <text x={width - 120} y="30" fill="#cbd5e1" fontSize="11">Scan {scanAngle}°</text>
      </g>
    </svg>
  );
}
