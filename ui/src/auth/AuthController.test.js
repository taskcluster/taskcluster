import { vi, describe, it, expect, beforeEach } from 'vitest';
import AuthController from './AuthController';
import { AUTH_STORE } from '../utils/constants';

describe('AuthController', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(
      AUTH_STORE,
      JSON.stringify({
        identityProviderId: 'github',
        expires: new Date(Date.now() - 1000).toISOString(),
        credentials: { clientId: 'test', accessToken: 'expired' },
      })
    );
  });

  it('clears the session when renewal is rejected with 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    expect(await new AuthController().getCredentials()).toBeUndefined();
    expect(localStorage.getItem(AUTH_STORE)).toBeNull();
  });

  it('keeps the session when renewal fails temporarily', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    await expect(new AuthController().getCredentials()).rejects.toThrow('503');
    expect(localStorage.getItem(AUTH_STORE)).not.toBeNull();
  });
});
