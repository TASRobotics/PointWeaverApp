export const distToSegmentSquared = (x: number, y: number, x1: number, y1: number, x2: number, y2: number) => {
  const l2 = (x1 - x2) ** 2 + (y1 - y2) ** 2;
  if (l2 === 0) return (x - x1) ** 2 + (y - y1) ** 2;
  let t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (x - (x1 + t * (x2 - x1))) ** 2 + (y - (y1 + t * (y2 - y1))) ** 2;
};
