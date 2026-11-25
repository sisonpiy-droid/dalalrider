function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  baseZoom = 1;

  constructor() {
    this.baseZoom = ('ontouchstart' in window) ? 0.6 : 1.0;
    this.zoom = this.baseZoom;
  }

  update(
    bikeX: number,
    bikeY: number,
    bikeVelX: number,
    grounded: boolean,
    airTime: number
  ) {
    const leadX = bikeVelX * 30;
    const targetX = bikeX + leadX + 80;
    const targetY = bikeY - 80;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const lerpX = Math.min(0.25, 0.08 + Math.abs(dx) * 0.0005);
    const lerpY = Math.min(0.2, 0.06 + Math.abs(dy) * 0.0005);

    this.x = lerp(this.x, targetX, lerpX);
    this.y = lerp(this.y, targetY, lerpY);

    const maxDrift = 300;
    if (Math.abs(bikeX - this.x) > maxDrift) {
      this.x = bikeX + Math.sign(this.x - bikeX) * maxDrift;
    }
    if (Math.abs(bikeY - this.y) > maxDrift) {
      this.y = bikeY + Math.sign(this.y - bikeY) * maxDrift;
    }

    if (!grounded && airTime > 0.3) {
      this.zoom = lerp(this.zoom, this.baseZoom * 0.85, 0.02);
    } else {
      this.zoom = lerp(this.zoom, this.baseZoom, 0.05);
    }
  }
}
