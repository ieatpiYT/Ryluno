import test from 'node:test';
import assert from 'node:assert/strict';
import { coachingTopic, evaluateConceptualAnswer } from '../src/lib/coaching.ts';
import { emptyData } from '../src/lib/types.ts';

test('adaptive coaching chooses an overdue topic', () => {
  const data = emptyData();
  data.problems = [{ id: 'p', title: 'Two Sum', url: '', topics: ['hash map'], difficulty: 'Easy', attempts: [{ id: 'a', at: '2020-01-01T00:00:00.000Z', minutes: 10, outcome: 'failed', confidence: 1, notes: '' }] }];
  assert.equal(coachingTopic(data, new Date('2020-01-03T00:00:00.000Z'))?.prompt.topic, 'hash map');
});

test('conceptual answers are scored separately from coding attempts', () => {
  const data = emptyData();
  data.problems = [{ id: 'p', title: 'Two Sum', url: '', topics: ['hash map'], difficulty: 'Easy', attempts: [] }];
  const prompt = coachingTopic(data, new Date())!.prompt;
  assert.equal(evaluateConceptualAnswer(prompt, 'I use complement lookup in expected O(n) time with O(n) space.').passed, true);
  assert.equal(evaluateConceptualAnswer(prompt, 'I would try things until it works.').passed, false);
});
