

function isResizePoint(value) {
  if (!value || typeof value !== "object") return false;
  const point = value;
  return Number.isFinite(point.screenX) && Number.isFinite(point.screenY);
}
function createFocusResizeSession(pointer, rawBounds, workArea, minWidth, minHeight) {
  const safeMinWidth = clamp$1(Math.round(minWidth), 1, Math.max(1, workArea.width));
  const safeMinHeight = clamp$1(Math.round(minHeight), 1, Math.max(1, workArea.height));
  const x = clamp$1(
    Math.round(rawBounds.x),
    workArea.x,
    workArea.x + workArea.width - safeMinWidth
  );
  const y = clamp$1(
    Math.round(rawBounds.y),
    workArea.y,
    workArea.y + workArea.height - safeMinHeight
  );
  const width = clamp$1(
    Math.round(rawBounds.width),
    safeMinWidth,
    workArea.x + workArea.width - x
  );
  const height = clamp$1(
    Math.round(rawBounds.height),
    safeMinHeight,
    workArea.y + workArea.height - y
  );
  return {
    pointer: { screenX: pointer.screenX, screenY: pointer.screenY },
    bounds: { x, y, width, height },
    workArea: { ...workArea },
    minWidth: safeMinWidth,
    minHeight: safeMinHeight
  };
}
function focusResizeBounds(session, pointer) {
  const { bounds, workArea } = session;
  const maxWidth = workArea.x + workArea.width - bounds.x;
  const maxHeight = workArea.y + workArea.height - bounds.y;
  const width = clamp$1(
    Math.round(bounds.width + pointer.screenX - session.pointer.screenX),
    session.minWidth,
    maxWidth
  );
  const height = clamp$1(
    Math.round(bounds.height + pointer.screenY - session.pointer.screenY),
    session.minHeight,
    maxHeight
  );
  return { x: bounds.x, y: bounds.y, width, height };
}
function clamp$1(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export { isResizePoint, createFocusResizeSession, focusResizeBounds, clamp$1 };
