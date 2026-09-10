// Browser wheel signs describe scrolling, not the user's physical encoder rotation.
// This page-local polarity follows the user's observed board; never rewrite encoder NVS.
export function promptWheelStep(event, reverseSelection = true) {
  const delta = Math.abs(event.deltaX || 0) > Math.abs(event.deltaY || 0) ? event.deltaX : event.deltaY;
  return Number.isFinite(delta) && delta !== 0 ? Math.sign(delta) * (reverseSelection ? -1 : 1) : 0;
}

export function revealPromptRow(list, row) {
  if (!list || !row) return;
  const outer = list.getBoundingClientRect();
  const inner = row.getBoundingClientRect();
  if (inner.top < outer.top) list.scrollTop -= outer.top - inner.top;
  else if (inner.bottom > outer.bottom) list.scrollTop += inner.bottom - outer.bottom;
}
