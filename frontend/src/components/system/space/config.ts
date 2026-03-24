export const SCENE = {
  farStars: {
    count: 16000,
    spread: 100,
    pointSize: 0.06,
    minBright: 0.2,
    maxBright: 0.85,
    driftSpeed: 0.00015,
    centerCalm: 0.3,
  },
  nearStars: {
    count: 800,
    spread: 40,
    pointSize: 0.12,
    minBright: 0.4,
    maxBright: 1.0,
    driftSpeed: 0.0005,
    centerCalm: 0.2,
  },
  microStars: {
    count: 35,
    spread: 18,
    pointSize: 0.2,
    minBright: 0.6,
    maxBright: 1.0,
    driftSpeed: 0.0008,
    centerCalm: 0.5,
  },
  flyby: {
    minInterval: 25,  // seconds
    maxInterval: 90,
    duration: 4,       // seconds to cross
    scale: 0.15,
    brightness: 0.7,
    trailLength: 8,
    routes: [
      // [startX, startY, endX, endY] normalized -1..1
      [-1.3, 0.6, 1.3, 0.4],    // upper-left to upper-right
      [1.3, -0.5, -1.3, -0.3],  // lower-right to lower-left
      [-1.3, -0.7, 1.3, -0.5],  // lower-left to lower-right
      [1.3, 0.7, -1.3, 0.5],    // upper-right to upper-left
      [-1.3, 0.3, 1.3, -0.4],   // diagonal high-left to low-right
      [1.3, 0.2, -1.3, -0.6],   // diagonal high-right to low-left
    ] as [number, number, number, number][],
  },
  camera: {
    fov: 55,
    near: 0.1,
    far: 250,
    position: [0, 0, 0] as [number, number, number],
  },
  parallax: {
    amplitude: 0.18,
    smoothing: 0.025,
  },
} as const
