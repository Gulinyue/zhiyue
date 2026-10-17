

function normalizeRequestedDisplayId(value) {
  if (typeof value !== "string") return void 0;
  const normalized = value.trim();
  return normalized || void 0;
}
function resolveExactCaptureSourceId(displays, sources, displayId) {
  const exact = sources.find((source) => source.displayId === displayId);
  if (exact) return exact.id;
  if (displays.length === 1 && displays[0]?.id === displayId && sources.length === 1 && !sources[0]?.displayId) {
    return sources[0].id;
  }
  return null;
}
function resolvePrimaryCaptureSourceId(displays, sources, primaryDisplayId) {
  return resolveExactCaptureSourceId(displays, sources, primaryDisplayId) ?? sources[0]?.id ?? null;
}
function resolveLocalCaptureSourceId(displays, sources, displayId) {
  const exact = resolveExactCaptureSourceId(displays, sources, displayId);
  if (exact) return exact;
  const displayIndex = displays.findIndex((display) => display.id === displayId);
  if (displayIndex < 0 || displays.length !== sources.length || sources.length === 0 || sources.some((source) => source.displayId.trim() !== "") || new Set(sources.map((source) => source.id)).size !== sources.length) {
    return null;
  }
  return sources[displayIndex]?.id ?? null;
}

export { normalizeRequestedDisplayId, resolveExactCaptureSourceId, resolvePrimaryCaptureSourceId, resolveLocalCaptureSourceId };
