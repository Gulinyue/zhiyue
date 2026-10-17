import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreenshotRecoveryScheduler, ScreenshotVisibilityLeases } from '../src/main/capture/scheduler.mjs';
import { resolveLocalCaptureSourceId, resolveExactCaptureSourceId } from '../src/main/capture/source-selection.mjs';
import { createLongScreenshotScroller } from '../src/main/capture/scrolling.mjs';

test('capture lane remains serial after an operation fails', async () => {
  const scheduler = new ScreenshotRecoveryScheduler(1000);
  const seen = [];
  const first = scheduler.run(async () => { seen.push(1); throw new Error('failed'); });
  const second = scheduler.run(async () => { seen.push(2); return 'ok'; });
  await assert.rejects(first, /failed/);
  assert.equal(await second, 'ok');
  assert.deepEqual(seen, [1, 2]);
});

test('timeout releases visibility, expires old queued work, and permits recovery', async () => {
  let timeout;
  let clockNow = 0;
  const scheduler = new ScreenshotRecoveryScheduler(8, {
    now: () => clockNow,
    setTimeout: (callback) => { timeout = callback; return 1; },
    clearTimeout() {},
  });
  let released = false;
  let staleRan = false;
  const first = scheduler.run((attempt) => {
    attempt.onInvalidate(() => { released = true; });
    return new Promise(() => {});
  });
  const stale = scheduler.run(() => { staleRan = true; });
  const rejection = assert.rejects(first, { code: 'CAPTURE_TIMEOUT' });
  const staleRejection = assert.rejects(stale, /lane expired/);
  await Promise.resolve();
  await Promise.resolve();
  clockNow = 8;
  timeout();
  assert.equal(released, true);
  await rejection;
  await staleRejection;
  assert.equal(staleRan, false);
  assert.equal(await scheduler.run(() => 'new frame'), 'new frame');
  assert.equal(scheduler.getSnapshot().state, 'healthy');
  assert.equal(scheduler.getSnapshot().recoveryCount, 1);
});

test('manual reset synchronously invalidates outstanding capture resources', async () => {
  const scheduler = new ScreenshotRecoveryScheduler(1000);
  let cleaned = false;
  const pending = scheduler.run((attempt) => {
    attempt.onInvalidate(() => { cleaned = true; });
    return new Promise(() => {});
  });
  const rejection = assert.rejects(pending, /reset/);
  await Promise.resolve();
  await Promise.resolve();
  scheduler.reset();
  assert.equal(cleaned, true);
  await rejection;
  assert.equal(await scheduler.run(() => 42), 42);
});

test('overlapping capture leases restore a visible window exactly once', () => {
  let hides = 0;
  let reveals = 0;
  const leases = new ScreenshotVisibilityLeases({ isVisible: () => true, hide: () => hides++, reveal: () => reveals++ });
  const a = leases.acquire();
  const b = leases.acquire();
  a.release();
  assert.equal(reveals, 0);
  b.release();
  b.release();
  assert.equal(hides, 1);
  assert.equal(reveals, 1);
});

test('capturing with a hidden window never reveals it', () => {
  let reveals = 0;
  const leases = new ScreenshotVisibilityLeases({ isVisible: () => false, hide() {}, reveal: () => reveals++ });
  leases.acquire().release();
  assert.equal(reveals, 0);
});

test('display selection refuses ambiguous multi-monitor source mappings', () => {
  const displays = [{ id: 'a' }, { id: 'b' }];
  const sources = [{ id: 'screen:0', displayId: '' }];
  assert.equal(resolveLocalCaptureSourceId(displays, sources, 'b'), null);
  assert.equal(resolveExactCaptureSourceId(displays, sources, 'b'), null);
  assert.equal(resolveLocalCaptureSourceId(displays, [...sources, { id: 'screen:1', displayId: '' }], 'b'), 'screen:1');
  assert.equal(resolveLocalCaptureSourceId(displays, [{ id: 'same', displayId: '' }, { id: 'same', displayId: '' }], 'b'), null);
});

test('scroll capture stops when modifiers, target identity or Escape change', () => {
  let sent = 0;
  let state = { processId: process.pid + 1, identity: 'window-a', cursor: { x: 30, y: 30 }, hoveringTarget: true, inputBusy: false };
  const scroller = createLongScreenshotScroller({ x: 0, y: 0, width: 100, height: 100 }, () => false, {
    bindings: { snapshot: () => state, scrollDown: () => { sent++; } },
  });
  assert.equal(scroller.scrollDown(), true);
  state = { ...state, inputBusy: true };
  assert.equal(scroller.scrollDown(), false);
  state = { ...state, inputBusy: false, identity: 'window-b' };
  assert.equal(scroller.scrollDown(), false);
  state = { ...state, escapePressed: true };
  assert.throws(() => scroller.scrollDown(), { code: 'CAPTURE_LONG_INTERRUPTED' });
  assert.equal(sent, 1);
});
