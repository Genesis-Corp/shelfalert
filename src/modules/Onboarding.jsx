// ============================================================================
// Ledgerline — first-run onboarding wizard
// ============================================================================
import React, { useState } from 'react';
import { useStore } from '../store';

const STEPS = ['Welcome', 'Business', 'Financial year', 'Defaults', 'Done'];

export default function OnboardingWizard() {
  const { state, setProfile, setOnboarded } = useStore();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({
    businessName: state.profile.businessName || '',
    abn: state.profile.abn || '',
    fyStartMonth: state.profile.fyStartMonth || 7,
    currency: state.profile.currency || 'AUD',
    smallBusiness: state.profile.smallBusiness ?? true,
    fontSize: state.profile.fontSize || 14,
  });

  const next = () => setStep(s => Math.min(STEPS.length - 1, s + 1));
  const prev = () => setStep(s => Math.max(0, s - 1));
  const finish = () => { setProfile(draft); setOnboarded(true); };

  return (
    <div className="wizard">
      <div className="wizard-card">
        <div className="wizard-header">
          <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Step {step + 1} of {STEPS.length}</div>
          <h2 className="wizard-title">{
            step === 0 ? 'Welcome to Ledgerline' :
            step === 1 ? 'Business profile' :
            step === 2 ? 'Financial year' :
            step === 3 ? 'Defaults' : 'You\'re all set'
          }</h2>
          <div className="wizard-sub">{
            step === 0 ? 'A unified personal & business finance suite for Australians.' :
            step === 1 ? 'Tell us about your business or sole trader entity.' :
            step === 2 ? 'When does your financial year start? Most Australian businesses use July.' :
            step === 3 ? 'Pick a few defaults — these can be changed later.' :
            'Sample data has been loaded so you can explore. Replace it anytime via Settings.'
          }</div>
        </div>

        <div className="wizard-step">
          {step === 0 && (
            <div>
              <p style={{ lineHeight: 1.6 }}>
                Ledgerline brings together <b>personal budgeting</b>, <b>double-entry bookkeeping</b>,
                <b> Australian tax</b> (BAS, PAYG, Super, CGT, FBT, depreciation), <b>portfolio tracking</b>,
                <b> payroll & HR</b>, and an <b>AI assistant</b> — all in one polished desktop app.
              </p>
              <div style={{ background: 'var(--primary-soft)', padding: 12, borderRadius: 6, color: 'var(--primary-2)', fontSize: '0.9em', marginTop: 12 }}>
                Setup takes less than a minute. You can change everything later in Settings.
              </div>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="field">
                <label className="field-label">Business / entity name</label>
                <input className="input" value={draft.businessName} onChange={e => setDraft({ ...draft, businessName: e.target.value })} placeholder="Acme Roasters Pty Ltd" />
              </div>
              <div className="field">
                <label className="field-label">ABN (optional)</label>
                <input className="input" value={draft.abn} onChange={e => setDraft({ ...draft, abn: e.target.value })} placeholder="00 000 000 000" />
              </div>
              <div className="field">
                <label className="field-label">Entity type</label>
                <select className="input" value={draft.smallBusiness ? 'small' : 'full'} onChange={e => setDraft({ ...draft, smallBusiness: e.target.value === 'small' })}>
                  <option value="small">Small business / base rate entity (25% tax)</option>
                  <option value="full">Standard company (30% tax)</option>
                </select>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="field">
              <label className="field-label">Financial year starts</label>
              <select className="input" value={draft.fyStartMonth} onChange={e => setDraft({ ...draft, fyStartMonth: Number(e.target.value) })}>
                <option value={7}>July (standard Australian)</option>
                <option value={1}>January</option>
                <option value={4}>April</option>
                <option value={10}>October</option>
              </select>
              <div className="dim mt-2" style={{ fontSize: '0.85em' }}>Australian businesses typically use 1 July – 30 June.</div>
            </div>
          )}

          {step === 3 && (
            <>
              <div className="field">
                <label className="field-label">Default currency</label>
                <select className="input" value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value })}>
                  <option value="AUD">AUD — Australian Dollar</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="NZD">NZD — New Zealand Dollar</option>
                  <option value="GBP">GBP — Pound Sterling</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Interface text size</label>
                <select className="input" value={draft.fontSize} onChange={e => setDraft({ ...draft, fontSize: Number(e.target.value) })}>
                  <option value={12}>Compact (12px)</option>
                  <option value={14}>Default (14px)</option>
                  <option value={16}>Large (16px)</option>
                  <option value={18}>Extra large (18px)</option>
                </select>
              </div>
            </>
          )}

          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
              <p>You're ready. We've pre-populated your workspace with realistic sample data so you can explore every module immediately.</p>
              <p className="muted" style={{ fontSize: '0.9em' }}>Reset to fresh data anytime via <b>Settings → Data</b>.</p>
            </div>
          )}
        </div>

        <div className="wizard-footer">
          <div className="wizard-dots">
            {STEPS.map((_, i) => <div key={i} className={`wizard-dot ${i === step ? 'active' : ''}`} />)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && <button className="btn" onClick={prev}>Back</button>}
            {step < STEPS.length - 1 && <button className="btn btn-primary" onClick={next}>Next</button>}
            {step === STEPS.length - 1 && <button className="btn btn-success" onClick={finish}>Open Ledgerline</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
