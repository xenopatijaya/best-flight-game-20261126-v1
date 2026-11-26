// input.js — one job: read the keyboard (and the on-screen throttle) into
// one plain input object the flight model consumes every frame.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_CAMERA = 8;
export const ACTION_MISSION_1 = 16;
export const ACTION_MISSION_2 = 32;
export const ACTION_MISSION_3 = 64;

export function createInput() {
  const keys = new Set();
  let actions = 0;
  let throttle = 0;
  let gearDown = true;

  function keyDown(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space' || e.code === 'Enter') actions |= ACTION_CONFIRM;
    if (e.code === 'KeyP' || e.code === 'Escape') actions |= ACTION_PAUSE;
    if (e.code === 'KeyR') actions |= ACTION_RESTART;
    if (e.code === 'KeyC') actions |= ACTION_CAMERA;
    if (e.code === 'KeyG') gearDown = !gearDown;
    if (e.code === 'Digit1') actions |= ACTION_MISSION_1;
    if (e.code === 'Digit2') actions |= ACTION_MISSION_2;
    if (e.code === 'Digit3') actions |= ACTION_MISSION_3;
  }
  function keyUp(e) {
    keys.delete(e.code);
  }
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);

  /** Continuous stick + throttle state for this frame. */
  function read() {
    const pitchUp = keys.has('ArrowDown') || keys.has('KeyS');
    const pitchDown = keys.has('ArrowUp') || keys.has('KeyW');
    const rollLeft = keys.has('ArrowLeft') || keys.has('KeyA');
    const rollRight = keys.has('ArrowRight') || keys.has('KeyD');
    // Throttle: Shift / PageUp up, Ctrl / PageDown down; [ ] fine trim.
    if (keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('PageUp')) throttle = Math.min(1, throttle + 0.016 * 1.4);
    if (keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('PageDown')) throttle = Math.max(0, throttle - 0.016 * 1.4);
    if (keys.has('BracketLeft')) throttle = Math.max(0, throttle - 0.016 * 0.7);
    if (keys.has('BracketRight')) throttle = Math.min(1, throttle + 0.016 * 0.7);
    return {
      pitch: (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0),
      roll: (rollRight ? 1 : 0) - (rollLeft ? 1 : 0),
      throttle,
      flaps: keys.has('KeyF'),
      gear: gearDown,
      brake: keys.has('KeyB'),
    };
  }

  function setThrottle(v) {
    throttle = Math.max(0, Math.min(1, v));
  }

  function reset() {
    throttle = 0;
    gearDown = true;
    keys.clear();
    actions = 0;
  }

  function takeActions() {
    const a = actions;
    actions = 0;
    return a;
  }

  return { read, takeActions, setThrottle, reset };
}
