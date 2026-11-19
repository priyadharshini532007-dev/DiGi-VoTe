import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { api, errorCode, errorMessage, publicApi, saveSession } from '../api/client.js';
import VerifyReceipt from '../pages/public/VerifyReceipt.jsx';
import { Public } from '../api/endpoints.js';

vi.mock('../api/endpoints.js', () => ({ Public: { verifyReceipt: vi.fn() } }));

describe('API error handling', () => {
  it('turns API errors into readable messages', () => {
    expect(errorMessage({ response: { data: { message: 'Voting is not open' } } })).toBe('Voting is not open');
    expect(errorMessage({ response: { data: { fieldErrors: [{ field: 'email', message: 'must be valid' }] } } }))
      .toBe('email: must be valid');
    expect(errorMessage({ message: 'Network Error' })).toMatch(/Cannot reach/);
    expect(errorMessage({}, 'fallback')).toBe('fallback');
    expect(errorCode({ response: { data: { code: 'DUPLICATE_VOTE' } } })).toBe('DUPLICATE_VOTE');
  });

  it('never attaches the session token to anonymous ballot requests', async () => {
    saveSession({ token: 'secret-session', expiresAt: new Date(Date.now() + 60000).toISOString() });
    const authed = await api.interceptors.request.handlers[0].fulfilled({ headers: {} });
    expect(authed.headers.Authorization).toBe('Bearer secret-session');
    expect(publicApi.interceptors.request.handlers.length).toBe(0);
    saveSession(null);
  });

  it('shows an error when receipt verification fails and the result when it succeeds', async () => {
    Public.verifyReceipt.mockRejectedValueOnce({ response: { data: { message: 'Server unavailable' } } });
    render(<MemoryRouter><VerifyReceipt /></MemoryRouter>);
    await userEvent.type(screen.getByLabelText('Receipt code'), 'ABCDE');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Server unavailable')).toBeInTheDocument();

    Public.verifyReceipt.mockResolvedValueOnce({ status: 'RECEIPT_NOT_FOUND', meaning: 'No accepted ballot carries this receipt.', checks: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('No accepted ballot carries this receipt.')).toBeInTheDocument();
  });
});
