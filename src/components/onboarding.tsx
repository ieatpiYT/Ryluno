'use client';
import { useState } from 'react';
import { ArrowRight, Sprout } from 'lucide-react';
import type { Settings } from '@/lib/types';
import { localParts } from '@/lib/planner';
import { Dialog, Field } from './dialog';
export function Onboarding({ initial, onFinish, onClose, cloud=false }: {
  initial: Settings; cloud?: boolean; onFinish: (settings: Settings, addProblem: boolean) => boolean; onClose: () => void;
}) {
  const [settings, setSettings] = useState(initial);
  const [error, setError] = useState('');
  return <Dialog title="A little practice. A little progress." description="Welcome to Ryluno. Start small — we’ll help you decide what to revisit." onClose={onClose}>
    <div className="seedling" aria-hidden="true"><Sprout size={40}/></div>
    <form noValidate onSubmit={e => {
      e.preventDefault();
      if (!Number.isInteger(settings.goal) || settings.goal < 1 || settings.goal > 21) { setError('Choose between 1 and 21 sessions a week in Adjust my goal.'); return; }
      if (settings.interview && settings.interview < localParts(new Date(), settings.timezone).date) { setError('Choose today or a future date, or leave it blank.'); return; }
      if (!onFinish(settings, false)) setError('We couldn’t save your setup. Please try again.');
    }}>
      {error && <p role="alert" className="alert">{error}</p>}
      <div className="setup-recap"><strong>Your starting rhythm</strong><span>{settings.goal} sessions a week · {settings.length} minutes each</span><span>We’ll make a flexible plan. You can change it anytime.</span></div>
      <details className="disclosure"><summary>Adjust my goal <span>Optional</span></summary>
        <Field label="Sessions each week"><input type="number" min="1" max="21" required value={settings.goal} onChange={e => setSettings({ ...settings, goal: Number(e.target.value) })}/></Field>
        <Field label="Interview date"><input type="date" value={settings.interview} onChange={e => setSettings({ ...settings, interview: e.target.value })}/></Field>
      </details>
      <p className="subtle">{cloud?'Your practice is saved to your account. Connect Fo on Today whenever you’re ready.':'No account needed. Your practice stays on this device. Optional Fo check-ins are in Settings.'}</p>
      <div className="modal-actions"><button className="primary" type="submit">Let’s begin <ArrowRight size={16}/></button></div>
    </form>
  </Dialog>;
}
