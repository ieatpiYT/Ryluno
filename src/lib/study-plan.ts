import type { Data } from './types.ts';
import { generatePlan } from './planner.ts';

/** Extend the rolling plan without moving or replacing any existing session. */
export function extendStudyPlan(data: Data, now = new Date()): Data {
  // Do not keep filling the same availability window on each reload. Generate
  // a fresh horizon when the current plan has run out; edits remain explicit.
  if (data.sessions.some(session => session.status === 'scheduled' && Date.parse(session.end) >= now.getTime())) return data;
  const additions = generatePlan(data.settings, data.sessions, now);
  return additions.length ? { ...data, sessions: [...data.sessions, ...additions] } : data;
}
