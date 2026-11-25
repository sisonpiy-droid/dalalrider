import Matter from 'matter-js';

export interface Bike {
  frame: Matter.Body;
  frontWheel: Matter.Body;
  rearWheel: Matter.Body;
  guard: Matter.Body;
  constraints: Matter.Constraint[];
  composite: Matter.Composite;
}

const WHEEL_RADIUS = 14;
const FRAME_WIDTH = 42;
const FRAME_HEIGHT = 12;
const WHEELBASE = 70;
const SUSPENSION_LENGTH = 20;
const MAX_WHEEL_SPEED = 0.7;
const MAX_VELOCITY = 14;
const DRIVE_FORCE = 0.013;

const V_SPREAD = 8;
const LEAN_FORCE = 0.009;
const JUMP_FORCE = 0.07;

export function createBike(x: number, y: number, world: Matter.World): Bike {
  const frameY = y - WHEEL_RADIUS - SUSPENSION_LENGTH;

  const frame = Matter.Bodies.rectangle(x, frameY, FRAME_WIDTH, FRAME_HEIGHT, {
    mass: 4,
    friction: 0.5,
    frictionAir: 0.005,
    restitution: 0.05,
    label: 'frame',
    collisionFilter: { group: -1, mask: 0 },
  });

  const wheelY = y - WHEEL_RADIUS;
  const rearWheel = Matter.Bodies.circle(
    x - WHEELBASE / 2, wheelY, WHEEL_RADIUS,
    { mass: 1.2, friction: 0.9, frictionAir: 0.001, restitution: 0.02, label: 'wheel', collisionFilter: { group: -1 } }
  );

  const frontWheel = Matter.Bodies.circle(
    x + WHEELBASE / 2, wheelY, WHEEL_RADIUS,
    { mass: 1.2, friction: 0.9, frictionAir: 0.001, restitution: 0.02, label: 'wheel', collisionFilter: { group: -1 } }
  );

  const rearX = -FRAME_WIDTH / 2;
  const frontX = FRAME_WIDTH / 2;
  const hGap = (WHEELBASE / 2) - (FRAME_WIDTH / 2);
  const diagUpper = Math.sqrt(hGap * hGap + (SUSPENSION_LENGTH + V_SPREAD) ** 2);
  const diagLower = Math.sqrt(hGap * hGap + (SUSPENSION_LENGTH - V_SPREAD) ** 2);

  const suspension = { stiffness: 0.6, damping: 0.25 };
  const brace = { stiffness: 0.6, damping: 0.25 };

  const rearUpper = Matter.Constraint.create({
    bodyA: frame, pointA: { x: rearX, y: -V_SPREAD },
    bodyB: rearWheel, length: diagUpper, ...suspension,
  });
  const rearLower = Matter.Constraint.create({
    bodyA: frame, pointA: { x: rearX, y: V_SPREAD },
    bodyB: rearWheel, length: diagLower, ...suspension,
  });
  const frontUpper = Matter.Constraint.create({
    bodyA: frame, pointA: { x: frontX, y: -V_SPREAD },
    bodyB: frontWheel, length: diagUpper, ...suspension,
  });
  const frontLower = Matter.Constraint.create({
    bodyA: frame, pointA: { x: frontX, y: V_SPREAD },
    bodyB: frontWheel, length: diagLower, ...suspension,
  });

  const wheelBrace = Matter.Constraint.create({
    bodyA: rearWheel, bodyB: frontWheel,
    length: WHEELBASE, ...brace,
  });

  const guardRadius = 10;
  const guard = Matter.Bodies.circle(x, frameY + FRAME_HEIGHT / 2 + guardRadius, guardRadius, {
    mass: 0.1,
    friction: 0.3,
    restitution: 0,
    label: 'guard',
    collisionFilter: { group: -1 },
  });
  const guardConstraint = Matter.Constraint.create({
    bodyA: frame, pointA: { x: 0, y: FRAME_HEIGHT / 2 + guardRadius },
    bodyB: guard, length: 0, stiffness: 1, damping: 0.1,
  });

  const constraints = [rearUpper, rearLower, frontUpper, frontLower, wheelBrace, guardConstraint];

  const composite = Matter.Composite.create();
  Matter.Composite.add(composite, [frame, rearWheel, frontWheel, guard, ...constraints]);
  Matter.Composite.add(world, composite);

  return { frame, frontWheel, rearWheel, guard, constraints, composite };
}

const PROBE_RADIUS = WHEEL_RADIUS + 4;
const PROBE_COUNT = 8;
const PROBE_ANGLES: number[] = [];
for (let i = 0; i < PROBE_COUNT; i++) {
  PROBE_ANGLES.push((i / PROBE_COUNT) * Math.PI * 2);
}

function isInPeakTip(hit: Matter.Body, probeX: number): boolean {
  const p = (hit as any).peakInfo;
  if (!p) return false;
  return (p.side === 'asc' && probeX > p.peakX) || (p.side === 'desc' && probeX < p.peakX);
}

function isWheelGrounded(wheel: Matter.Body, nearbyTerrain: Matter.Body[]): boolean {
  const cx = wheel.position.x;
  const cy = wheel.position.y;
  for (let i = 0; i < PROBE_COUNT; i++) {
    const px = cx + Math.cos(PROBE_ANGLES[i]) * PROBE_RADIUS;
    const py = cy + Math.sin(PROBE_ANGLES[i]) * PROBE_RADIUS;
    const hits = Matter.Query.point(nearbyTerrain, { x: px, y: py });
    for (let h = 0; h < hits.length; h++) {
      if (!isInPeakTip(hits[h], px)) return true;
    }
  }
  return false;
}

export function isRearGrounded(bike: Bike, nearbyTerrain: Matter.Body[]): boolean {
  return isWheelGrounded(bike.rearWheel, nearbyTerrain);
}

export function isFrontGrounded(bike: Bike, nearbyTerrain: Matter.Body[]): boolean {
  return isWheelGrounded(bike.frontWheel, nearbyTerrain);
}

export function getContactAngle(bike: Bike, nearbyTerrain: Matter.Body[]): number | null {
  for (const wheel of [bike.rearWheel, bike.frontWheel]) {
    const cx = wheel.position.x;
    const cy = wheel.position.y;
    for (let i = 0; i < PROBE_COUNT; i++) {
      const px = cx + Math.cos(PROBE_ANGLES[i]) * PROBE_RADIUS;
      const py = cy + Math.sin(PROBE_ANGLES[i]) * PROBE_RADIUS;
      const hits = Matter.Query.point(nearbyTerrain, { x: px, y: py });
      for (let h = 0; h < hits.length; h++) {
        if (!isInPeakTip(hits[h], px)) return (hits[h] as any).slopeAngle ?? hits[h].angle;
      }
    }
  }
  return null;
}

export function accelerate(bike: Bike, nearbyTerrain: Matter.Body[], terrainPoints?: {x: number, y: number}[], grounded = false) {
  const rearDown = isRearGrounded(bike, nearbyTerrain);
  const frontOnly = !rearDown && isFrontGrounded(bike, nearbyTerrain);
  if (!rearDown && !frontOnly) return;

  const driveWheel = rearDown ? bike.rearWheel : bike.frontWheel;
  let forceMul = 1;
  if (frontOnly && terrainPoints) {
    const wx = bike.frontWheel.position.x;
    let lo = 0, hi = terrainPoints.length - 2;
    while (lo < hi) { const mid = (lo + hi) >> 1; terrainPoints[mid + 1].x < wx ? lo = mid + 1 : hi = mid; }
    if (lo < terrainPoints.length - 1) {
      const dx = terrainPoints[lo + 1].x - terrainPoints[lo].x;
      const dy = terrainPoints[lo + 1].y - terrainPoints[lo].y;
      const slope = Math.abs(Math.atan2(dy, dx));
      const steep45 = Math.PI / 4;
      const steep70 = 70 * Math.PI / 180;
      if (slope < steep45) {
        forceMul = 0;
      } else {
        forceMul = 0.3 + 0.3 * Math.min(1, (slope - steep45) / (steep70 - steep45));
      }
    } else {
      forceMul = 0;
    }
  } else if (frontOnly) {
    forceMul = 0;
  }

  const currentSpeed = driveWheel.angularVelocity;
  if (currentSpeed < MAX_WHEEL_SPEED) {
    Matter.Body.setAngularVelocity(driveWheel, currentSpeed + 0.03 * forceMul);
  }

  if (!grounded) return;

  const throttle = Math.max(0, 1 - bike.frame.velocity.x / MAX_VELOCITY);
  if (throttle <= 0) return;

  const baseMag = DRIVE_FORCE * throttle * forceMul;
  let forceX = baseMag;
  let forceY = 0;
  let slopeAngle = 0;
  if (terrainPoints) {
    const wx = driveWheel.position.x + 25;
    let lo = 0, hi = terrainPoints.length - 2;
    while (lo < hi) { const mid = (lo + hi) >> 1; terrainPoints[mid + 1].x < wx ? lo = mid + 1 : hi = mid; }
    const wheelX = driveWheel.position.x;
    let wlo = 0, whi = terrainPoints.length - 2;
    while (wlo < whi) { const mid = (wlo + whi) >> 1; terrainPoints[mid + 1].x < wheelX ? wlo = mid + 1 : whi = mid; }
    const curDy = terrainPoints[wlo + 1].y - terrainPoints[wlo].y;
    const lookDy = terrainPoints[lo + 1].y - terrainPoints[lo].y;
    if (curDy < 0 && lookDy > 0) lo = wlo;
    if (lo < terrainPoints.length - 1) {
      const dx = terrainPoints[lo + 1].x - terrainPoints[lo].x;
      const dy = terrainPoints[lo + 1].y - terrainPoints[lo].y;
      slopeAngle = Math.abs(Math.atan2(dy, dx));
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      forceX = (dx / len) * baseMag;
      forceY = (dy / len) * baseMag;
    }
  }

  Matter.Body.applyForce(driveWheel, driveWheel.position, { x: forceX, y: forceY });
}

export function brake(bike: Bike) {
  Matter.Body.setAngularVelocity(bike.rearWheel, bike.rearWheel.angularVelocity * 0.88);
  Matter.Body.setAngularVelocity(bike.frontWheel, bike.frontWheel.angularVelocity * 0.88);
}

function applyCouple(bike: Bike, direction: number, strength = 1) {
  const { frame } = bike;
  const cos = Math.cos(frame.angle);
  const sin = Math.sin(frame.angle);
  const offset = FRAME_WIDTH / 2;

  const perpX = -sin * LEAN_FORCE * strength * direction;
  const perpY = cos * LEAN_FORCE * strength * direction;

  const frontPoint = { x: frame.position.x + cos * offset, y: frame.position.y + sin * offset };
  const rearPoint = { x: frame.position.x - cos * offset, y: frame.position.y - sin * offset };

  Matter.Body.applyForce(frame, frontPoint, { x: -perpX, y: -perpY });
  Matter.Body.applyForce(frame, rearPoint, { x: perpX, y: perpY });
}

export function leanBack(bike: Bike, strength = 1) {
  applyCouple(bike, 1, strength);
}

export function leanForward(bike: Bike, strength = 1) {
  applyCouple(bike, -1, strength);
}

export function jump(bike: Bike, grounded: boolean) {
  if (!grounded) return;
  const impulse = { x: 0, y: -JUMP_FORCE };
  Matter.Body.applyForce(bike.frame, bike.frame.position, impulse);
  Matter.Body.applyForce(bike.rearWheel, bike.rearWheel.position, { x: 0, y: -JUMP_FORCE * 0.4 });
  Matter.Body.applyForce(bike.frontWheel, bike.frontWheel.position, { x: 0, y: -JUMP_FORCE * 0.4 });
}

export function isGrounded(bike: Bike, nearbyTerrain: Matter.Body[]): boolean {
  return isWheelGrounded(bike.rearWheel, nearbyTerrain) || isWheelGrounded(bike.frontWheel, nearbyTerrain);
}

export function drawBike(
  ctx: CanvasRenderingContext2D,
  bike: Bike,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  options?: { noHanderBlend?: number; supermanBlend?: number; founderFace?: HTMLImageElement; faceRadius?: number; opacity?: number; hideRider?: boolean; squash?: number; bodyColor?: string }
) {
  ctx.save();
  if (options?.opacity !== undefined) ctx.globalAlpha = options.opacity;
  ctx.translate(-cameraX + canvasWidth / 2, -cameraY + canvasHeight / 2);

  const { frame, frontWheel, rearWheel } = bike;
  const cos = Math.cos(frame.angle);
  const sin = Math.sin(frame.angle);
  const sq = (options?.squash || 0) * 5;

  const toWorld = (lx: number, ly: number) => ({
    x: frame.position.x + cos * lx - sin * ly,
    y: frame.position.y + sin * lx + cos * ly,
  });

  for (const wheel of [rearWheel, frontWheel]) {
    ctx.save();
    ctx.translate(wheel.position.x, wheel.position.y);
    ctx.rotate(wheel.angle);

    ctx.beginPath();
    ctx.arc(0, 0, WHEEL_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const inner = WHEEL_RADIUS - 3;
      const outer = WHEEL_RADIUS - 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, WHEEL_RADIUS - 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.8;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 2, Math.sin(a) * 2);
      ctx.lineTo(Math.cos(a) * (WHEEL_RADIUS - 4), Math.sin(a) * (WHEEL_RADIUS - 4));
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#777';
    ctx.fill();

    ctx.restore();
  }

  const rearAnchor = toWorld(-FRAME_WIDTH / 2 + 2, 2 + sq);
  ctx.beginPath();
  ctx.moveTo(rearAnchor.x, rearAnchor.y);
  ctx.lineTo(rearWheel.position.x, rearWheel.position.y);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 3;
  ctx.stroke();

  const forkTop = toWorld(FRAME_WIDTH / 2 - 2, -6 + sq);
  const forkMid = toWorld(FRAME_WIDTH / 2 + 2, -2 + sq);
  for (const offset of [-2, 2]) {
    const perpX = -sin * offset;
    const perpY = cos * offset;
    ctx.beginPath();
    ctx.moveTo(forkTop.x + perpX, forkTop.y + perpY);
    ctx.lineTo(forkMid.x + perpX, forkMid.y + perpY);
    ctx.lineTo(frontWheel.position.x + perpX, frontWheel.position.y + perpY);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(frame.position.x, frame.position.y);
  ctx.rotate(frame.angle);
  if (sq) ctx.translate(0, sq);

  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(6, 0);
  ctx.lineTo(8, 8);
  ctx.lineTo(-10, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  ctx.strokeStyle = options?.bodyColor || '#E24B4A';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-FRAME_WIDTH / 2 + 4, -2);
  ctx.lineTo(0, -FRAME_HEIGHT / 2 - 2);
  ctx.lineTo(FRAME_WIDTH / 2 - 4, -6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -FRAME_HEIGHT / 2 - 2);
  ctx.lineTo(-2, 6);
  ctx.stroke();
  ctx.strokeStyle = '#C43';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-2, -FRAME_HEIGHT / 2);
  ctx.lineTo(-FRAME_WIDTH / 2 + 2, 0);
  ctx.stroke();

  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.moveTo(-FRAME_WIDTH / 2 + 6, -4);
  ctx.quadraticCurveTo(-FRAME_WIDTH / 2 + 12, -10, -2, -FRAME_HEIGHT / 2 - 3);
  ctx.lineTo(4, -FRAME_HEIGHT / 2 - 4);
  ctx.quadraticCurveTo(2, -FRAME_HEIGHT / 2, -2, -FRAME_HEIGHT / 2 - 3);
  ctx.lineTo(-FRAME_WIDTH / 2 + 6, -4);
  ctx.fill();

  ctx.fillStyle = options?.bodyColor || '#E24B4A';
  ctx.beginPath();
  ctx.moveTo(2, -FRAME_HEIGHT / 2 - 4);
  ctx.quadraticCurveTo(8, -FRAME_HEIGHT / 2 - 8, FRAME_WIDTH / 2 - 8, -8);
  ctx.lineTo(FRAME_WIDTH / 2 - 6, -4);
  ctx.quadraticCurveTo(6, -FRAME_HEIGHT / 2 + 2, 2, -FRAME_HEIGHT / 2 - 4);
  ctx.fill();

  ctx.fillStyle = '#ddd';
  ctx.beginPath();
  ctx.arc(FRAME_WIDTH / 2 - 2, -10, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(FRAME_WIDTH / 2 - 6, -14);
  ctx.lineTo(FRAME_WIDTH / 2 + 2, -16);
  ctx.stroke();

  ctx.strokeStyle = '#777';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-4, 8);
  ctx.quadraticCurveTo(-12, 12, -FRAME_WIDTH / 2 + 4, 6);
  ctx.stroke();
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-FRAME_WIDTH / 2 + 4, 6);
  ctx.lineTo(-FRAME_WIDTH / 2, 5);
  ctx.stroke();

  if (options?.hideRider) {
    ctx.restore();
    ctx.restore();
    return;
  }
  const riderColor = '#bbb';
  const sb = options?.supermanBlend || 0;

  if (sb > 0.01) {
    const lerp = (a: number, b: number) => a + (b - a) * sb;
    const handX = FRAME_WIDTH / 2 - 4;
    const handY = -14;

    ctx.fillStyle = '#333';
    ctx.fillRect(lerp(-2, -34), lerp(4, -15), lerp(8, 5), lerp(4, 3));

    ctx.strokeStyle = riderColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(lerp(0, -10), lerp(-6, -16));
    ctx.lineTo(lerp(0, -32), lerp(4, -14));
    ctx.stroke();

    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(lerp(0, -10), lerp(-6, -16));
    ctx.lineTo(lerp(4, 10), lerp(-FRAME_HEIGHT / 2 - 16, -17));
    ctx.stroke();

    const smHeadX = lerp(4, 12);
    const smHeadY = lerp(-FRAME_HEIGHT / 2 - 26, -27);
    if (options?.founderFace) {
      ctx.save();
      ctx.beginPath();
      const smR = options.faceRadius || 12;
      ctx.arc(smHeadX, smHeadY, smR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(options.founderFace, smHeadX - smR, smHeadY - smR, smR * 2, smR * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#E24B4A';
      ctx.beginPath();
      ctx.arc(smHeadX, smHeadY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      const vx = lerp(6, 14);
      const vy = lerp(-FRAME_HEIGHT / 2 - 19, -20);
      ctx.beginPath();
      ctx.arc(vx, vy, 2.5, -0.5, 0.8);
      ctx.lineTo(vx, vy);
      ctx.fill();
    }

    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(lerp(4, 10), lerp(-FRAME_HEIGHT / 2 - 16, -17));
    ctx.lineTo(handX, handY);
    ctx.stroke();
  } else {
    const nhb = options?.noHanderBlend || 0;

    ctx.fillStyle = '#333';
    ctx.fillRect(-2, 4, 8, 4);

    ctx.strokeStyle = riderColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(2, 4);
    ctx.lineTo(-2, -4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(2, 4);
    ctx.lineTo(4, -6);
    ctx.stroke();

    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(4, -FRAME_HEIGHT / 2 - 16);
    ctx.stroke();

    const headX = 4;
    const headY = -FRAME_HEIGHT / 2 - 26;
    if (options?.founderFace) {
      ctx.save();
      ctx.beginPath();
      const hR = options.faceRadius || 12;
      ctx.arc(headX, headY, hR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(options.founderFace, headX - hR, headY - hR, hR * 2, hR * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = options?.bodyColor || '#E24B4A';
      ctx.beginPath();
      ctx.arc(headX, headY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(headX + 2, headY + 1, 2.5, -0.5, 0.8);
      ctx.lineTo(headX + 2, headY + 1);
      ctx.fill();
    }

    ctx.strokeStyle = riderColor;
    ctx.lineWidth = 2.5;
    if (nhb > 0.01) {
      const shoulderX = 4;
      const shoulderY = -FRAME_HEIGHT / 2 - 12;
      const handleX = FRAME_WIDTH / 2 - 4;
      const handleY = -14;
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.lineTo(handleX + (-10 - handleX) * nhb, handleY + (-FRAME_HEIGHT / 2 - 24 - handleY) * nhb);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.lineTo(handleX + (18 - handleX) * nhb, handleY + (-FRAME_HEIGHT / 2 - 26 - handleY) * nhb);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(4, -FRAME_HEIGHT / 2 - 12);
      ctx.quadraticCurveTo(FRAME_WIDTH / 2 - 10, -FRAME_HEIGHT / 2 - 14, FRAME_WIDTH / 2 - 4, -14);
      ctx.stroke();
    }
  }

  ctx.restore();
  ctx.restore();
}

let ghostWheelAngle = 0;
let ghostLastX = 0;

export function drawGhostBike(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, angle: number,
  cameraX: number, cameraY: number, canvasWidth: number, canvasHeight: number,
) {
  ghostWheelAngle += (x - ghostLastX) / WHEEL_RADIUS;
  ghostLastX = x;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const toWorld = (lx: number, ly: number) => ({
    x: x + cos * lx - sin * ly,
    y: y + sin * lx + cos * ly,
  });
  const rearPos = toWorld(-WHEELBASE / 2, SUSPENSION_LENGTH);
  const frontPos = toWorld(WHEELBASE / 2, SUSPENSION_LENGTH);
  const mock = {
    frame: { position: { x, y }, angle },
    rearWheel: { position: rearPos, angle: ghostWheelAngle },
    frontWheel: { position: frontPos, angle: ghostWheelAngle },
    guard: { position: { x, y }, angle },
    constraints: [],
    composite: {},
  } as unknown as Bike;
  drawBike(ctx, mock, cameraX, cameraY, canvasWidth, canvasHeight, { opacity: 0.25 });
}


export function drawOpponentBike(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, angle: number,
  nickname: string, color: string,
  cameraX: number, cameraY: number, canvasWidth: number, canvasHeight: number,
) {
  ghostWheelAngle += (x - ghostLastX) / WHEEL_RADIUS;
  ghostLastX = x;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const toWorld = (lx: number, ly: number) => ({
    x: x + cos * lx - sin * ly,
    y: y + sin * lx + cos * ly,
  });
  const rearPos = toWorld(-WHEELBASE / 2, SUSPENSION_LENGTH);
  const frontPos = toWorld(WHEELBASE / 2, SUSPENSION_LENGTH);
  const mock = {
    frame: { position: { x, y }, angle },
    rearWheel: { position: rearPos, angle: ghostWheelAngle },
    frontWheel: { position: frontPos, angle: ghostWheelAngle },
    guard: { position: { x, y }, angle },
    constraints: [],
    composite: {},
  } as unknown as Bike;
  drawBike(ctx, mock, cameraX, cameraY, canvasWidth, canvasHeight, { opacity: 0.9, bodyColor: color });

  // Draw floating name tag above friend's bike
  ctx.save();
  ctx.translate(-cameraX + canvasWidth / 2, -cameraY + canvasHeight / 2);
  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  const tw = ctx.measureText(nickname).width + 12;
  const tx = x;
  const ty = y - 54;
  ctx.fillStyle = 'rgba(10, 12, 16, 0.85)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(tx - tw / 2, ty - 10, tw, 18, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(nickname, tx, ty - 1);
  ctx.restore();
}

export interface RagdollBodies {
  head: Matter.Body;
  torso: Matter.Body;
  legs: Matter.Body;
  armL: Matter.Body;
  armR: Matter.Body;
}

export function drawRagdoll(
  ctx: CanvasRenderingContext2D,
  rag: RagdollBodies,
  cameraX: number,
  cameraY: number,
  canvasWidth: number,
  canvasHeight: number,
  face?: HTMLImageElement,
) {
  ctx.save();
  ctx.translate(-cameraX + canvasWidth / 2, -cameraY + canvasHeight / 2);

  const limb = (b: Matter.Body, halfLen: number, width: number, color = '#bbb') => {
    const dx = -Math.sin(b.angle) * halfLen;
    const dy = Math.cos(b.angle) * halfLen;
    ctx.beginPath();
    ctx.moveTo(b.position.x - dx, b.position.y - dy);
    ctx.lineTo(b.position.x + dx, b.position.y + dy);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  limb(rag.armL, 8, 2.5, '#8f8f8f');
  limb(rag.legs, 10, 3);

  const lb = rag.legs;
  ctx.save();
  ctx.translate(lb.position.x, lb.position.y);
  ctx.rotate(lb.angle);
  ctx.fillStyle = '#333';
  ctx.fillRect(-3.5, 7, 7, 6);
  ctx.restore();

  limb(rag.torso, 11, 3.5);

  const h = rag.head;
  if (face) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(h.position.x, h.position.y, 11, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(h.position.x, h.position.y);
    ctx.rotate(h.angle);
    ctx.drawImage(face, -11, -11, 22, 22);
    ctx.restore();
  } else {
    ctx.save();
    ctx.translate(h.position.x, h.position.y);
    ctx.rotate(h.angle);
    ctx.fillStyle = '#E24B4A';
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(2.5, 1, 3, -0.5, 0.8);
    ctx.lineTo(2.5, 1);
    ctx.fill();
    ctx.restore();
  }

  limb(rag.armR, 8, 2.5);

  ctx.restore();
}

export function stabilizeBike(bike: Bike) {
  const fx = bike.frame.position.x;
  const fy = bike.frame.position.y;
  const wheelY = fy + SUSPENSION_LENGTH;
  for (const [wheel, xOff] of [[bike.rearWheel, -WHEELBASE / 2], [bike.frontWheel, WHEELBASE / 2]] as [Matter.Body, number][]) {
    Matter.Body.setPosition(wheel, { x: fx + xOff, y: wheelY });
    Matter.Body.setVelocity(wheel, { ...bike.frame.velocity });
    Matter.Body.setAngularVelocity(wheel, 0);
  }
  Matter.Body.setPosition(bike.guard, { x: fx, y: fy + FRAME_HEIGHT / 2 + 10 });
  Matter.Body.setVelocity(bike.guard, { ...bike.frame.velocity });
  Matter.Body.setAngularVelocity(bike.guard, 0);
}

export function resetBike(bike: Bike, x: number, y: number) {
  const frameY = y - WHEEL_RADIUS - SUSPENSION_LENGTH;
  const wheelY = y - WHEEL_RADIUS;

  Matter.Body.setPosition(bike.frame, { x, y: frameY });
  Matter.Body.setVelocity(bike.frame, { x: 0, y: 0 });
  Matter.Body.setAngle(bike.frame, 0);
  Matter.Body.setAngularVelocity(bike.frame, 0);

  Matter.Body.setPosition(bike.rearWheel, { x: x - WHEELBASE / 2, y: wheelY });
  Matter.Body.setVelocity(bike.rearWheel, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(bike.rearWheel, 0);

  Matter.Body.setPosition(bike.frontWheel, { x: x + WHEELBASE / 2, y: wheelY });
  Matter.Body.setVelocity(bike.frontWheel, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(bike.frontWheel, 0);

  Matter.Body.setPosition(bike.guard, { x, y: frameY + FRAME_HEIGHT / 2 + 10 });
  Matter.Body.setVelocity(bike.guard, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(bike.guard, 0);
}
