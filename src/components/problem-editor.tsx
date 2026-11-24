'use client';
import { useState } from 'react';
import type { Outcome, Problem, Settings } from '@/lib/types';
import { Dialog, Field } from './dialog';

export type EditorState = { problem?: Problem; mode: 'new' | 'edit' | 'attempt'; minutes?: number };
export function ProblemEditor({ editor, preferred, onClose, onSave }: {
  editor: EditorState; preferred: Settings['difficulty']; onClose: () => void;
  onSave: (problem: Problem) => boolean;
}) {
  const p = editor.problem;
  const [title, setTitle] = useState(p?.title ?? '');
  const [url, setUrl] = useState(p?.url ?? '');
  const [topics, setTopics] = useState(p?.topics.join(', ') ?? '');
  const [difficulty, setDifficulty] = useState(p?.difficulty ?? preferred);
  const [outcome, setOutcome] = useState<Outcome | ''>('');
  const [minutes, setMinutes] = useState(String(editor.minutes ?? 25));
  const [confidence, setConfidence] = useState(3);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(editor.mode === 'edit');
  return <Dialog title={editor.mode === 'edit' ? 'Edit problem' : 'How did practice go?'} description={editor.mode === 'attempt' ? p?.title : undefined} onClose={onClose}>
    <form noValidate onSubmit={e => {
      e.preventDefault();
      if (!title.trim() || title.trim().length > 200) { setError('Give this problem a name.'); return; }
      if (url.trim() && !/^https:\/\/(www\.)?leetcode\.com\/problems\/[^\s]+$/.test(url.trim())) { setExpanded(true); setError('Use a LeetCode problem link or leave it blank.'); return; }
      if (editor.mode !== 'edit' && (!outcome || !minutes || !Number.isFinite(Number(minutes)) || Number(minutes) < 0 || Number(minutes) > 1440)) { setExpanded(true); setError('Choose how it went and a practice time between 0 and 1,440 minutes.'); return; }
      const next: Problem = {
        id: p?.id ?? crypto.randomUUID(), title: title.trim(), url: url.trim(),
        topics: Array.from(new Set(topics.split(',').map(t => t.trim()).filter(Boolean))), difficulty,
        attempts: editor.mode === 'edit' ? p!.attempts : [...(p?.attempts ?? []), {
          id: crypto.randomUUID(), at: new Date().toISOString(), minutes: Number(minutes), outcome: outcome as Outcome, confidence, notes: notes.trim(),
        }],
      };
      if (!onSave(next)) setError('We couldn’t save that yet. Your entries are still here. Please try again.');
    }}>
      {error && <p className="alert" role="alert">{error}</p>}
      {editor.mode !== 'attempt' && <Field label="Problem name"><input autoFocus required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Two Sum"/></Field>}
      {editor.mode !== 'edit' && <fieldset className="outcome-options"><legend>How did it go?</legend>{([
        ['independent', 'Got it on my own'], ['hints', 'Needed a hint'], ['failed', 'Still figuring it out'],
      ] as const).map(([value,label]) => <label key={value} className={outcome === value ? 'selected' : ''}><input type="radio" required name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)}/><span><strong>{label}</strong></span></label>)}</fieldset>}
      <details className="disclosure" open={expanded} onToggle={e => setExpanded(e.currentTarget.open)}><summary>{editor.mode === 'edit' ? 'Problem details' : 'Time, confidence & details'}{editor.mode !== 'edit' && <span>{minutes} min · confidence {confidence}/5</span>}</summary>
        {editor.mode !== 'edit' && <>
          <div className="form-grid"><Field label="Time spent (minutes)"><input type="number" min="0" max="1440" value={minutes} onChange={e => setMinutes(e.target.value)}/></Field>
          <Field label="Confidence"><select value={confidence} onChange={e => setConfidence(Number(e.target.value))}>{['1 · Lots to revisit','2 · A few gaps','3 · Getting there','4 · Feeling good','5 · Could teach it'].map((v,i) => <option key={v} value={i+1}>{v}</option>)}</select></Field></div>
          <Field label="A note for next time"><textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What would you try differently?"/></Field>
        </>}
        <Field label="Difficulty"><select value={difficulty} onChange={e => setDifficulty(e.target.value as Problem['difficulty'])}>{['Easy','Medium','Hard'].map(d => <option key={d}>{d}</option>)}</select></Field>
        <Field label="LeetCode link (optional)"><input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://leetcode.com/problems/two-sum/"/></Field>
        <Field label="Topics (optional, comma separated)"><input value={topics} onChange={e => setTopics(e.target.value)} placeholder="Arrays, Hash maps"/></Field>
      </details>
      <div className="modal-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{editor.mode === 'edit' ? 'Save changes' : 'Save practice'}</button></div>
    </form>
  </Dialog>;
}
