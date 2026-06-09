// Pure coordinate mapping: from a mouse event over the displayed canvas
// to the headless browser's viewport pixel space. Kept pure so it's unit-testable.

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * @param {{clientX:number, clientY:number, rect:{left:number,top:number,width:number,height:number}, width:number, height:number}} p
 * @returns {{x:number, y:number}} viewport-space pixel coordinates, clamped to [0,width]/[0,height]
 */
export function toViewport({ clientX, clientY, rect, width, height }) {
  const scaleX = width / rect.width;
  const scaleY = height / rect.height;
  const x = Math.round(clamp((clientX - rect.left) * scaleX, 0, width));
  const y = Math.round(clamp((clientY - rect.top) * scaleY, 0, height));
  return { x, y };
}
