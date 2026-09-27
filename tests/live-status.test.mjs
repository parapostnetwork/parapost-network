import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveDisplayStatus, getLiveDisplayLabel, LIVE_REPLAY_DELAY_MS } from '../lib/live/status.ts';
const endedAt = Date.parse('2026-09-26T20:00:00Z');
const ended = { status: 'ended', ended_at: new Date(endedAt).toISOString() };
test('six-hour grace starts at the recorded end and switches exactly at the boundary', () => {
  assert.equal(getLiveDisplayStatus(ended, endedAt), 'live');
  assert.equal(getLiveDisplayStatus(ended, endedAt + LIVE_REPLAY_DELAY_MS - 1), 'live');
  assert.equal(getLiveDisplayStatus(ended, endedAt + LIVE_REPLAY_DELAY_MS), 'ended');
});
test('a running broadcast never becomes replay just because six hours passed', () => {
  assert.equal(getLiveDisplayStatus({ status: 'live' }, endedAt + 24 * 60 * 60 * 1000), 'live');
});
test('labels are Live Soon, Live, Replay and do not revive hidden lifecycle states', () => {
  assert.equal(getLiveDisplayLabel({ status: 'upcoming' }), 'Live Soon');
  assert.equal(getLiveDisplayLabel({ status: 'live' }), 'Live');
  assert.equal(getLiveDisplayLabel(ended, endedAt + LIVE_REPLAY_DELAY_MS), 'Replay');
  for (const status of ['draft', 'cancelled']) assert.equal(getLiveDisplayStatus({ ...ended, status }, endedAt), status);
});
test('missing, invalid or future end timestamps do not invent a grace window', () => {
  for (const ended_at of [null, 'invalid', new Date(endedAt + 1000).toISOString()]) {
    assert.equal(getLiveDisplayStatus({ status: 'ended', ended_at }, endedAt), 'ended');
  }
});
