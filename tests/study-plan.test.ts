import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../src/lib/types.ts';
import { extendStudyPlan } from '../src/lib/study-plan.ts';
import { validateData } from '../src/lib/storage.ts';
const now = new Date('2026-11-23T08:00:00Z');
test('beginner defaults produce a valid rolling plan without changing settings', () => {
  const data = emptyData();
  data.settings.timezone = 'America/Toronto';
  const planned = extendStudyPlan(data, now);
  assert.ok(planned.sessions.length > 0);
  assert.deepEqual(planned.settings, data.settings);
  assert.equal(planned.settings.length, 25);
  assert.equal(planned.settings.difficulty, 'Easy');
  assert.equal(validateData(planned), planned);
  assert.equal(extendStudyPlan(planned, now), planned);
});
test('automatic planning preserves existing sessions, attempts and legacy preferences', () => {
  const data = emptyData();
  data.settings.length = 45; data.settings.difficulty = 'Hard'; data.settings.accountability = true;
  data.settings.timezone = 'America/Toronto';
  data.sessions = [{id:'completed-session',start:'2026-11-22T10:00:00Z',end:'2026-11-22T10:45:00Z',status:'completed'}];
  data.problems = [{id:'problem',title:'Existing problem',difficulty:'Hard',topics:['Arrays'],url:'',attempts:[{id:'attempt',at:'2026-11-22T10:45:00Z',minutes:45,confidence:2,outcome:'hints',notes:'Keep this note'}]}];
  const planned = extendStudyPlan(data, now);
  assert.deepEqual(planned.problems, data.problems);
  assert.deepEqual(planned.sessions[0], data.sessions[0]);
  assert.deepEqual(planned.settings, data.settings);
  assert.equal(validateData(planned), planned);
});
test('empty availability and passed interviews do not fabricate a plan', () => {
  const data = emptyData(); data.settings.availability = [];
  assert.equal(extendStudyPlan(data, now), data);
  const past = emptyData(); past.settings.interview = '2026-11-01';
  assert.equal(extendStudyPlan(past, now), past);
});
test('reloading a partial week never adds a second session in the same window', () => {
  const data = emptyData(); data.settings.timezone = 'America/Toronto';
  const tuesday = new Date('2026-11-24T16:00:00Z');
  const planned = extendStudyPlan(data, tuesday);
  assert.ok(planned.sessions.length);
  assert.equal(extendStudyPlan(planned, tuesday), planned);
});
