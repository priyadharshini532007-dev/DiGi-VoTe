import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FirebaseAuthPanel from '../components/FirebaseAuthPanel.jsx';
import AuthAction from '../pages/public/AuthAction.jsx';
import { firebaseErrorMessage } from '../lib/firebaseErrors.js';
import * as fb from '../lib/firebase.js';

vi.mock('../lib/firebase.js', () => ({
  registerWithEmail: vi.fn(), signInWithEmail: vi.fn(), signInWithGoogle: vi.fn(), verifiedIdTokenOrNull: vi.fn(),
  resendVerificationEmail: vi.fn(), sendPasswordReset: vi.fn(), applyEmailVerification: vi.fn(),
  checkPasswordResetCode: vi.fn(), completePasswordReset: vi.fn(),
}));

const err = (code) => Object.assign(new Error(code), { code });

beforeEach(() => vi.clearAllMocks());

describe('Firebase error messages', () => {
  it('maps Firebase and DigiVote codes to clear messages', () => {
    expect(firebaseErrorMessage(err('auth/email-already-in-use'))).toMatch(/already exists/);
    expect(firebaseErrorMessage(err('auth/invalid-credential'))).toBe('Incorrect email or password.');
    expect(firebaseErrorMessage(err('auth/expired-action-code'))).toMatch(/expired/);
    expect(firebaseErrorMessage({ response: { data: { code: 'EMAIL_NOT_VERIFIED', message: 'x' } } })).toMatch(/Verify your email/);
    expect(firebaseErrorMessage({ response: { data: { code: 'NO_ACCOUNT', message: 'x' } } })).toMatch(/No DigiVote account/);
    expect(firebaseErrorMessage(err('something/unknown'))).toBe('Sign-in failed. Please try again.');
  });
});

describe('FirebaseAuthPanel', () => {
  it('creates an account, requires verification, and continues only once verified', async () => {
    const onIdToken = vi.fn();
    fb.registerWithEmail.mockResolvedValue({});
    fb.verifiedIdTokenOrNull.mockResolvedValueOnce(null).mockResolvedValueOnce('verified-token');
    render(<FirebaseAuthPanel allowCreate submitLabel="Create organization" onIdToken={onIdToken} />);
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.org');
    await userEvent.type(screen.getByLabelText('Password'), 'abcdefgh12');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'abcdefgh12');
    await userEvent.click(screen.getByRole('button', { name: /Create account and send verification email/ }));
    expect(fb.registerWithEmail).toHaveBeenCalledWith('new@example.org', 'abcdefgh12');
    expect(await screen.findByText('Verify your email address')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /I have verified/ }));
    expect(await screen.findByText(/not verified yet/)).toBeInTheDocument();
    expect(onIdToken).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /I have verified/ }));
    expect(onIdToken).toHaveBeenCalledWith('verified-token');
  });

  it('rejects weak or mismatched passwords before calling Firebase', async () => {
    render(<FirebaseAuthPanel allowCreate onIdToken={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: /Create account/ }));
    expect(screen.getByText(/at least 10 characters/)).toBeInTheDocument();
    expect(fb.registerWithEmail).not.toHaveBeenCalled();
  });

  it('shows a clear message for duplicate accounts', async () => {
    fb.registerWithEmail.mockRejectedValue(err('auth/email-already-in-use'));
    render(<FirebaseAuthPanel allowCreate onIdToken={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Email'), 'dup@example.org');
    await userEvent.type(screen.getByLabelText('Password'), 'abcdefgh12');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'abcdefgh12');
    await userEvent.click(screen.getByRole('button', { name: /Create account/ }));
    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
  });

  it('sends unverified users to the verification step and can resend the email', async () => {
    fb.signInWithEmail.mockRejectedValue(err('auth/email-not-verified'));
    fb.resendVerificationEmail.mockResolvedValue();
    render(<FirebaseAuthPanel submitLabel="Sign in" onIdToken={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Email'), 'u@example.org');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Verify your email address')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resend email' }));
    expect(fb.resendVerificationEmail).toHaveBeenCalled();
    expect(await screen.findByText(/new verification email/)).toBeInTheDocument();
  });

  it('reports invalid credentials and backend rejections', async () => {
    fb.signInWithEmail.mockRejectedValueOnce(err('auth/invalid-credential'));
    const onIdToken = vi.fn().mockRejectedValue({ response: { data: { code: 'NO_ACCOUNT', message: 'x' } } });
    render(<FirebaseAuthPanel submitLabel="Sign in" onIdToken={onIdToken} />);
    await userEvent.type(screen.getByLabelText('Email'), 'u@example.org');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-pass1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Incorrect email or password.')).toBeInTheDocument();
    fb.signInWithEmail.mockResolvedValueOnce('id-token');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/No DigiVote account uses this email/)).toBeInTheDocument();
  });

  it('signs in with Google and passes the ID token on', async () => {
    fb.signInWithGoogle.mockResolvedValue('google-token');
    const onIdToken = vi.fn();
    render(<FirebaseAuthPanel onIdToken={onIdToken} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(onIdToken).toHaveBeenCalledWith('google-token');
  });

  it('sends a password reset email', async () => {
    fb.sendPasswordReset.mockResolvedValue();
    render(<FirebaseAuthPanel onIdToken={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.getByText(/Enter your email address above/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Email'), 'u@example.org');
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(fb.sendPasswordReset).toHaveBeenCalledWith('u@example.org');
    expect(await screen.findByText('Check your inbox')).toBeInTheDocument();
  });

  it('runs the caller precondition before any Firebase call', async () => {
    render(<FirebaseAuthPanel beforeSubmit={() => 'Fill in the organization name first.'} onIdToken={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByText('Fill in the organization name first.')).toBeInTheDocument();
    expect(fb.signInWithGoogle).not.toHaveBeenCalled();
  });
});

describe('email action links', () => {
  const renderAt = (query) => render(
    <MemoryRouter initialEntries={[`/auth/action?${query}`]}><Routes><Route path="/auth/action" element={<AuthAction />} /></Routes></MemoryRouter>);

  it('verifies an email', async () => {
    fb.applyEmailVerification.mockResolvedValue();
    renderAt('mode=verifyEmail&oobCode=abc');
    expect(await screen.findByText('Email verified')).toBeInTheDocument();
  });

  it('explains expired verification links', async () => {
    fb.applyEmailVerification.mockRejectedValue(err('auth/expired-action-code'));
    renderAt('mode=verifyEmail&oobCode=old');
    expect(await screen.findByText(/link has expired/)).toBeInTheDocument();
  });

  it('resets a password with a valid link and rejects a used one', async () => {
    fb.checkPasswordResetCode.mockResolvedValue('u@example.org');
    fb.completePasswordReset.mockResolvedValue();
    renderAt('mode=resetPassword&oobCode=good');
    await userEvent.type(await screen.findByLabelText('New password'), 'newpassword12');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'newpassword12');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(fb.completePasswordReset).toHaveBeenCalledWith('good', 'newpassword12');
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
  });

  it('rejects invalid reset links', async () => {
    fb.checkPasswordResetCode.mockRejectedValue(err('auth/invalid-action-code'));
    renderAt('mode=resetPassword&oobCode=used');
    expect(await screen.findByText(/invalid or has already been used/)).toBeInTheDocument();
  });
});
