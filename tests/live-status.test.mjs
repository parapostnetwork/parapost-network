import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveDisplayStatus, getLiveDisplayLabel, LIVE_REPLAY_DELAY_MS } from '../lib/live/status.ts';
const start = Date.parse('2026-09-26T20:00:00Z');
const show = { status: 'upcoming', scheduled_at: new Date(start).toISOString() };
test('schedule switches Live Soon to Live at start, then Replay exactly six hours later', () => {
  assert.equal(getLiveDisplayLabel(show, start - 1), 'Live Soon');
  assert.equal(getLiveDisplayLabel(show, start), 'Live');
  assert.equal(getLiveDisplayLabel(show, start + LIVE_REPLAY_DELAY_MS - 1), 'Live');
  assert.equal(getLiveDisplayLabel(show, start + LIVE_REPLAY_DELAY_MS), 'Replay');
});
test('schedule controls display even when synchronization has failed', () => {
  for (const status of ['upcoming', 'live']) {
    assert.equal(getLiveDisplayStatus({ ...show, status }, start + 1), 'live');
    assert.equal(getLiveDisplayStatus({ ...show, status }, start + LIVE_REPLAY_DELAY_MS), 'ended');
  }
});
test('manual End Show, cancellation, and draft are never revived by the schedule', () => {
  for (const status of ['ended', 'cancelled', 'draft']) assert.equal(getLiveDisplayStatus({ ...show, status }, start + 1), status);
});
test('unscheduled shows keep stored state; manual start is fallback when present', () => {
  assert.equal(getLiveDisplayStatus({ status: 'upcoming' }, start), 'upcoming');
  assert.equal(getLiveDisplayStatus({ status: 'live' }, start), 'live');
  assert.equal(getLiveDisplayStatus({ status: 'live', started_at: show.scheduled_at }, start + LIVE_REPLAY_DELAY_MS), 'ended');
  assert.equal(getLiveDisplayStatus({ ...show, started_at: '2026-09-27T00:00:00Z' }, start + LIVE_REPLAY_DELAY_MS), 'ended');
});
