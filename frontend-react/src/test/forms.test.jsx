import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Login, { validateLogin } from '../pages/public/Login.jsx';
import { validateRegistration } from '../pages/public/Register.jsx';
import { validateRules } from '../pages/admin/RulesForm.jsx';
import { AuthProvider } from '../auth/AuthContext.jsx';

describe('form validation', () => {
  it('validates login input', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({ email: 'Email is required', password: 'Password is required' });
    expect(validateLogin({ email: 'bad', password: 'x' }).email).toMatch(/valid email/);
    expect(validateLogin({ email: 'a@b.co', password: 'x' })).toEqual({});
  });

  it('validates organization registration', () => {
    const ok = { organizationName: 'Org', fullName: 'A', email: 'a@b.co', password: 'abcdefghi1', confirm: 'abcdefghi1' };
    expect(validateRegistration(ok)).toEqual({});
    expect(validateRegistration({ ...ok, password: 'short1', confirm: 'short1' }).password).toMatch(/10 characters/);
    expect(validateRegistration({ ...ok, password: 'abcdefghijk', confirm: 'abcdefghijk' }).password).toMatch(/letters and digits/);
    expect(validateRegistration({ ...ok, confirm: 'different1' }).confirm).toMatch(/do not match/);
  });

  it('mirrors the backend rule engine for common mistakes', () => {
    const base = { countingMethod: 'PLURALITY', maxSelections: 1, minCandidates: 2, notaEnabled: false, qrReceipts: true,
      receiptsRequired: true, votingStart: '2026-01-01T10:00:00Z', votingEnd: '2026-01-02T10:00:00Z', campaignEnd: '2026-01-01T10:00:00Z' };
    expect(validateRules(base)).toEqual({});
    expect(validateRules({ ...base, maxSelections: 2 }).maxSelections).toBeDefined();
    expect(validateRules({ ...base, countingMethod: 'APPROVAL' }).maxSelections).toBeDefined();
    expect(validateRules({ ...base, minCandidates: 1 }).notaEnabled).toBeDefined();
    expect(validateRules({ ...base, receiptsRequired: false }).qrReceipts).toBeDefined();
    expect(validateRules({ ...base, votingEnd: '2025-12-31T00:00:00Z' }).votingEnd).toBeDefined();
    expect(validateRules({ ...base, campaignEnd: '2026-01-05T00:00:00Z' }).campaignEnd).toBeDefined();
  });

  it('shows field errors instead of submitting an empty login form', async () => {
    render(<MemoryRouter><AuthProvider><Login /></AuthProvider></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
  });
});
