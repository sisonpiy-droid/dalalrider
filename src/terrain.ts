import Matter from 'matter-js';

export interface TerrainPoint {
  x: number;
  y: number;
}

export interface TerrainSegment {
  body: Matter.Body;
  topLeft: TerrainPoint;
  topRight: TerrainPoint;
}

export function generateTerrainPoints(worldWidth: number, baseY: number): TerrainPoint[] {
  const points: TerrainPoint[] = [];
  const segmentWidth = 40;
  const numPoints = Math.floor(worldWidth / segmentWidth);

  const launchpadLength = 400;
  for (let x = 0; x < launchpadLength; x += segmentWidth) {
    points.push({ x, y: baseY });
  }

  for (let i = 0; i < numPoints; i++) {
    const x = launchpadLength + i * segmentWidth;
    const t = i / numPoints;

    const hill1 = Math.sin(t * Math.PI * 2 * 1.5) * 120;
    const hill2 = Math.sin(t * Math.PI * 2 * 3.2 + 1) * 60;
    const hill3 = Math.sin(t * Math.PI * 2 * 7 + 2) * 25;
    const trend = -t * 150;

    const y = baseY + hill1 + hill2 + hill3 + trend;
    points.push({ x, y });
  }

  const lastY = points[points.length - 1].y;
  for (let i = 1; i <= 10; i++) {
    points.push({ x: points[points.length - 1].x + segmentWidth, y: lastY });
  }

  return points;
}

export interface PriceMapping {
  minPrice: number;
  priceRange: number;
  baseY: number;
  terrainH: number;
}

export function yToPrice(y: number, m: PriceMapping): number {
  return m.minPrice + ((m.baseY - y) / m.terrainH) * m.priceRange;
}

export function generateTerrainFromData(
  dataPoints: { date: string; close: number }[],
  baseY: number,
  smooth = false,
): { points: TerrainPoint[]; priceMapping: PriceMapping } {
  const points: TerrainPoint[] = [];

  const TERRAIN_HEIGHT = 2000;
  const X_PER_POINT = 100;
  const LAUNCHPAD = 400;

  const prices = dataPoints.map(d => d.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const moves: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    moves.push(Math.abs(prices[i] - prices[i - 1]) / priceRange);
  }
  moves.sort((a, b) => a - b);
  const medianMove = moves[Math.floor(moves.length / 2)] || 0;
  const TARGET_SLOPE = 0.268;
  const slopeScale = medianMove > 0 ? Math.min(8, Math.max(1, (TARGET_SLOPE * X_PER_POINT) / (medianMove * TERRAIN_HEIGHT))) : 1;
  const terrainH = TERRAIN_HEIGHT * slopeScale;

  const priceToY = (price: number) =>
    baseY - ((price - minPrice) / priceRange) * terrainH;

  const firstY = priceToY(prices[0]);
  for (let x = 0; x < LAUNCHPAD; x += 40) {
    points.push({ x, y: firstY });
  }

  const raw: TerrainPoint[] = [];
  for (let i = 0; i < prices.length; i++) {
    raw.push({ x: LAUNCHPAD + i * X_PER_POINT, y: priceToY(prices[i]) });
  }

  if (smooth) {
    const SUBDIV = 4;
    const TAU = 0.5;
    for (let i = 0; i < raw.length - 1; i++) {
      const p0 = raw[Math.max(0, i - 1)];
      const p1 = raw[i];
      const p2 = raw[i + 1];
      const p3 = raw[Math.min(raw.length - 1, i + 2)];
      for (let s = 0; s < SUBDIV; s++) {
        const t = s / SUBDIV;
        const t2 = t * t;
        const t3 = t2 * t;
        const x = p1.x + TAU * (-p0.x + p2.x) * t +
          (2 * TAU * p0.x + (TAU - 3) * p1.x + (3 - 2 * TAU) * p2.x - TAU * p3.x) * t2 +
          (-TAU * p0.x + (2 - TAU) * p1.x + (TAU - 2) * p2.x + TAU * p3.x) * t3;
        const y = p1.y + TAU * (-p0.y + p2.y) * t +
          (2 * TAU * p0.y + (TAU - 3) * p1.y + (3 - 2 * TAU) * p2.y - TAU * p3.y) * t2 +
          (-TAU * p0.y + (2 - TAU) * p1.y + (TAU - 2) * p2.y + TAU * p3.y) * t3;
        points.push({ x, y });
      }
    }
    points.push(raw[raw.length - 1]);
  } else {
    for (const p of raw) points.push(p);
  }

  const lastY = priceToY(prices[prices.length - 1]);
  const lastX = points[points.length - 1].x;
  for (let i = 1; i <= 25; i++) {
    points.push({ x: lastX + i * 40, y: lastY });
  }

  return { points, priceMapping: { minPrice, priceRange, baseY, terrainH: terrainH } };
}

export function createTerrainBodies(
  points: TerrainPoint[],
  world: Matter.World
): TerrainSegment[] {
  const segments: TerrainSegment[] = [];
  const thickness = 30;
  const overlap = 8;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const angle = Math.atan2(dy, dx);
    const steepness = Math.abs(Math.sin(angle));
    const segOverlap = overlap * (1 - steepness * 0.85);
    const rawLen = Math.sqrt(dx * dx + dy * dy);
    const prevDy = i > 0 ? points[i].y - points[i - 1].y : 0;
    const prevWasRising = prevDy < 0;
    const isDescending = dy > 0;
    const angleDeg = Math.abs(angle) * (180 / Math.PI);
    const isPeakDescent = prevWasRising && isDescending && angleDeg > 55;
    const segLen = (isPeakDescent ? Math.max(rawLen - 20, rawLen * 0.5) : rawLen) + segOverlap * 2;
    const segThickness = thickness;

    const shiftRatio = isPeakDescent ? (rawLen - segLen + segOverlap * 2) / (2 * rawLen) : 0;
    const cx = (p1.x + p2.x) / 2 + dx * shiftRatio;
    const surfaceCy = (p1.y + p2.y) / 2 + dy * shiftRatio;
    const perpX = -Math.sin(angle) * (segThickness / 2);
    const perpY = Math.cos(angle) * (segThickness / 2);

    const body = Matter.Bodies.rectangle(cx + perpX, surfaceCy + perpY, segLen, segThickness, {
      isStatic: true,
      angle,
      friction: 0.8,
      restitution: 0,
      render: { visible: false },
      label: 'terrain',
    });

    Matter.Composite.add(world, body);
    segments.push({ body, topLeft: p1, topRight: p2 });
  }

  return segments;
}

export interface TrendZone {
  startX: number;
  endX: number;
  up: boolean;
}

export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  points: TerrainPoint[],
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  trendZones?: TrendZone[],
  colorOverride?: string
) {
  if (points.length < 2) return;

  const margin = 600;
  const viewLeft = cameraX - canvasWidth / 2 - margin;
  const viewRight = cameraX + canvasWidth / 2 + margin;

  ctx.save();
  ctx.translate(-cameraX + canvasWidth / 2, -cameraY + canvasHeight / 2);

  ctx.beginPath();
  let started = false;
  let firstVisibleX = 0;
  let lastVisibleX = 0;

  for (const p of points) {
    if (p.x < viewLeft || p.x > viewRight) {
      if (started) {
        lastVisibleX = p.x;
        ctx.lineTo(p.x, p.y);
        break;
      }
      continue;
    }
    if (!started) {
      firstVisibleX = p.x;
      ctx.moveTo(p.x, p.y);
      started = true;
    } else {
      ctx.lineTo(p.x, p.y);
      lastVisibleX = p.x;
    }
  }

  if (!started) {
    ctx.restore();
    return;
  }

  const bottomY = cameraY + canvasHeight;
  ctx.lineTo(lastVisibleX, bottomY);
  ctx.lineTo(firstVisibleX, bottomY);
  ctx.closePath();

  ctx.fillStyle = '#1a1a20';
  ctx.fill();

  interface ZonePath { isUp: boolean; pts: { x: number; y: number }[] }
  const zonePaths: ZonePath[] = [];
  let zi = 0;
  let current: ZonePath | null = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.x < viewLeft) continue;
    if (p.x > viewRight && current) { current.pts.push(p); break; }
    if (p.x > viewRight) break;

    let isUp = true;
    if (trendZones && trendZones.length > 0) {
      while (zi < trendZones.length - 1 && p.x >= trendZones[zi].endX) zi++;
      isUp = trendZones[zi].up;
    }

    if (!current || current.isUp !== isUp) {
      if (current && current.pts.length > 0) {
        current.pts.push(p);
      }
      current = { isUp, pts: [p] };
      zonePaths.push(current);
    } else {
      current.pts.push(p);
    }
  }

  const glowOverride = colorOverride ? colorOverride.replace(/^#(..)(..)(..)$/, (_, r: string, g: string, b: string) => `rgba(${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)},0.06)`) : '';

  for (const zp of zonePaths) {
    if (zp.pts.length < 2) continue;
    const isUp = zp.isUp;

    const path = new Path2D();
    path.moveTo(zp.pts[0].x, zp.pts[0].y);
    for (let j = 1; j < zp.pts.length; j++) path.lineTo(zp.pts[j].x, zp.pts[j].y);

    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = glowOverride || (isUp ? 'rgba(93,202,165,0.06)' : 'rgba(226,75,74,0.06)');
    ctx.stroke(path);

    ctx.lineWidth = 2;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = colorOverride || (isUp ? '#5DCAA5' : '#E24B4A');
    ctx.stroke(path);
  }

  ctx.restore();
}
