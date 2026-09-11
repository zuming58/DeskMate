// Browser wheel input follows the operating-system convention. EasyInput encoder
// polarity is applied only to the source-identified native board event.
export function promptWheelStep(event) {
  const delta = Math.abs(event.deltaX || 0) > Math.abs(event.deltaY || 0) ? event.deltaX : event.deltaY;
  return Number.isFinite(delta) && delta !== 0 ? Math.sign(delta) : 0;
}

export function revealPromptRow(list, row) {
  if (!list || !row) return;
  const outer = list.getBoundingClientRect();
  const inner = row.getBoundingClientRect();
  if (inner.top < outer.top) list.scrollTop -= outer.top - inner.top;
  else if (inner.bottom > outer.bottom) list.scrollTop += inner.bottom - outer.bottom;
}
