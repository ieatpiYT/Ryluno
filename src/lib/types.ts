export type Outcome = 'independent' | 'hints' | 'failed';
export type Attempt = { id: string; at: string; minutes: number; outcome: Outcome; confidence: number; notes: string };
export type Problem = { id: string; title: string; url: string; topics: string[]; difficulty: 'Easy' | 'Medium' | 'Hard'; attempts: Attempt[] };
export type Availability = { day: number; start: string; end: string };
export type Settings = { timezone: string; length: number; goal: number; difficulty: 'Easy' | 'Medium' | 'Hard'; interview: string; accountability: boolean; availability: Availability[] };
export type Session = { id: string; start: string; end: string; status: 'scheduled' | 'completed' | 'skipped' };
export type Data = { version: 1; problems: Problem[]; sessions: Session[]; settings: Settings };
export const emptyData = (): Data => ({ version: 1, problems: [], sessions: [], settings: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, length: 25, goal: 3, difficulty: 'Easy', interview: '', accountability: false, availability: [{ day: 1, start: '18:00', end: '20:00' }, { day: 3, start: '18:00', end: '20:00' }, { day: 6, start: '10:00', end: '12:00' }] } });
