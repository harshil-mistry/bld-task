import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toViewport } from './coords.mjs';

test('maps the center of a half-scaled canvas to the viewport center', () => {
  const rect = { left: 0, top: 0, width: 640, height: 400 };
  assert.deepEqual(
    toViewport({ clientX: 320, clientY: 200, rect, width: 1280, height: 800 }),
    { x: 640, y: 400 }
  );
});

test('accounts for the canvas offset on the page', () => {
  const rect = { left: 100, top: 50, width: 1280, height: 800 };
  assert.deepEqual(
    toViewport({ clientX: 100, clientY: 50, rect, width: 1280, height: 800 }),
    { x: 0, y: 0 }
  );
});

test('clamps coordinates outside the canvas to the viewport bounds', () => {
  const rect = { left: 0, top: 0, width: 1280, height: 800 };
  assert.deepEqual(
    toViewport({ clientX: -50, clientY: -50, rect, width: 1280, height: 800 }),
    { x: 0, y: 0 }
  );
  assert.deepEqual(
    toViewport({ clientX: 5000, clientY: 5000, rect, width: 1280, height: 800 }),
    { x: 1280, y: 800 }
  );
});
