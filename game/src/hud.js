// hud.js — one job: the instrument panel — altitude, speed, heading compass,
// artificial horizon, fuel and throttle — all drawn from the flight state.
import { HUD } from './config.js';

function el(id) {
  return document.getElementById(id);
}

/** Compass strip: ticks every 30 degrees with cardinal labels. */
function drawCompass(canvas, headingDeg) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8, 20, 32, 0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f5f2e8';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labels = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
  const pxPerDeg = w / 120; // 120 degrees visible
  for (let d = -60; d <= 60; d += 5) {
    const deg = ((Math.round(headingDeg) + d) % 360 + 360) % 360;
    const x = w / 2 + d * pxPerDeg;
    if (deg % 30 === 0) {
      ctx.fillRect(x - 1, 6, 2, 12);
      ctx.fillText(labels[deg] ?? String(deg), x, 30);
    } else if (deg % 10 === 0) {
      ctx.fillRect(x - 1, 10, 2, 8);
    } else {
      ctx.fillRect(x - 1, 12, 1, 5);
    }
  }
  // Centre caret: the heading you are actually flying.
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 7, h - 2);
  ctx.lineTo(w / 2 + 7, h - 2);
  ctx.lineTo(w / 2, h - 12);
  ctx.closePath();
  ctx.fill();
}

/**
 * Vertical tape: a sliding scale with the current value boxed in amber at
 * the centre line. value/step/halfWindow in the tape's own units.
 */
function drawTape(canvas, value, step, halfWindow) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cy = h / 2;
  const pxPerUnit = h / (halfWindow * 2);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(8, 20, 32, 0.62)';
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = 'middle';
  const first = Math.ceil((value - halfWindow) / step) * step;
  for (let v = first; v <= value + halfWindow; v += step) {
    const y = cy - (v - value) * pxPerUnit;
    const major = v % (step * 5) === 0;
    ctx.fillStyle = '#f5f2e8';
    ctx.fillRect(4, y - 1, major ? 12 : 7, 2);
    if (major && v >= 0) {
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(v), 20, y);
    }
  }
  // Current value, boxed.
  ctx.fillStyle = '#ffb020';
  ctx.fillRect(0, cy - 13, w, 26);
  ctx.fillStyle = '#101820';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.max(0, Math.round(value))), w / 2, cy + 1);
}

/** Artificial horizon: sky/ground split rotated by roll, shifted by pitch. */
function drawHorizon(canvas, pitch, roll) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const pitchPx = Math.max(-50, Math.min(50, pitch * 90));
  ctx.translate(0, pitchPx);
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-80, -140, 160, 140);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-80, 0, 160, 140);
  ctx.strokeStyle = '#f5f2e8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-80, 0);
  ctx.lineTo(80, 0);
  ctx.stroke();
  ctx.restore();
  // Fixed wings marker + rim.
  ctx.strokeStyle = '#ffb020';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 34, cy);
  ctx.lineTo(cx - 12, cy);
  ctx.moveTo(cx + 12, cy);
  ctx.lineTo(cx + 34, cy);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(245, 242, 232, 0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Refresh every instrument from the live state.
 * snap: {altM, speedMs, headingDeg, pitch, roll, fuel, throttle, vsMs, gear, flaps}
 */
export function updateHud(snap, mission, objective) {
  const altFt = Math.max(0, Math.round(snap.altM * HUD.feetPerM));
  const speedKt = Math.max(0, Math.round(snap.speedMs * HUD.knotsPerMs));
  const hdg = ((Math.round(snap.headingDeg) % 360) + 360) % 360;
  el('hud-alt').textContent = `${altFt.toLocaleString('en-US')} ft`;
  el('hud-spd').textContent = `${speedKt} kt`;
  el('hud-hdg').textContent = `${String(hdg).padStart(3, '0')}°`;
  el('hud-vs').textContent = `${snap.vsMs >= 0 ? '+' : ''}${(snap.vsMs * HUD.feetPerM * 60).toFixed(0)} fpm`;
  drawCompass(el('hud-compass'), snap.headingDeg);
  drawHorizon(el('hud-horizon'), snap.pitch, snap.roll);
  drawTape(el('hud-tape-spd'), speedKt, 10, 50);
  drawTape(el('hud-tape-alt'), altFt, 100, 500);

  const fuelBar = el('hud-fuel-fill');
  fuelBar.style.width = `${Math.max(0, snap.fuel)}%`;
  fuelBar.className = snap.fuel < 20 ? 'fill low' : 'fill';
  el('hud-fuel-num').textContent = `${Math.round(snap.fuel)}%`;
  const thrBar = el('hud-thr-fill');
  thrBar.style.width = `${Math.round(snap.throttle * 100)}%`;
  el('hud-thr-num').textContent = `${Math.round(snap.throttle * 100)}%`;
  el('hud-gear').textContent = snap.gear ? 'GEAR DOWN' : 'GEAR UP';
  el('hud-gear').className = snap.gear ? 'pill ok' : 'pill warn';
  el('hud-flaps').textContent = snap.flaps ? 'FLAPS' : 'FLAPS UP';
  el('hud-flaps').className = snap.flaps ? 'pill ok' : 'pill';
  const dmg = Math.max(0, Math.min(100, Math.round(snap.damage ?? 0)));
  el('hud-dmg-fill').style.width = `${dmg}%`;
  el('hud-dmg-num').textContent = `${dmg}%`;

  if (mission) {
    el('hud-mission').textContent = mission.name;
    el('hud-objective').textContent = objective ? objective.label : '—';
    // Direction arrow: points toward the current objective, relative to the
    // heading the plane is actually flying (up = straight ahead).
    const arrow = el('hud-arrow');
    if (objective && objective.pos && snap.posX !== undefined) {
      const bearing = (Math.atan2(-(objective.pos.x - snap.posX), -(objective.pos.z - snap.posZ)) * 180) / Math.PI;
      const rel = ((bearing - snap.headingDeg) % 360 + 540) % 360 - 180;
      arrow.style.transform = `rotate(${rel.toFixed(0)}deg)`;
      arrow.style.opacity = '1';
    } else {
      arrow.style.opacity = '0.25';
    }
    const parts = [];
    if (mission.kind === 1) parts.push(`RINGS ${mission.nextRing}/${mission.rings.length}`);
    if (mission.kind === 2) parts.push(`STRIPS ${mission.stripsLanded.length}/3`);
    parts.push(`SCORE ${mission.score}`);
    parts.push(`TIME ${Math.floor(mission.elapsed / 60)}:${String(Math.floor(mission.elapsed % 60)).padStart(2, '0')}`);
    if (mission.timePar) {
      parts.push(`PAR ${Math.floor(mission.timePar / 60)}:${String(mission.timePar % 60).padStart(2, '0')}`);
    }
    el('hud-progress').textContent = parts.join('  ·  ');
  }
}

/** Flash a short centred message (ring taken, touchdown, warning). */
let toastTimer = null;
export function toast(message, ms = 2200) {
  const t = el('hud-toast');
  t.textContent = message;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
