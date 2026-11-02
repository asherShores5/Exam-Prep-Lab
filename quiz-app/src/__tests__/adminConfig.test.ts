import { describe, expect, it } from 'vitest';
import { readAdminConfig } from '../admin/config';

const ENV = {
  VITE_ACTIVITY_API: 'https://abc.execute-api.us-west-1.amazonaws.com/',
  VITE_COGNITO_DOMAIN: 'https://exampreplab-admin.auth.us-west-1.amazoncognito.com/',
  VITE_COGNITO_CLIENT_ID: 'client123',
};

describe('readAdminConfig', () => {
  it('builds the Admin Page config, redirecting back to /admin on this origin', () => {
    expect(readAdminConfig(ENV, 'https://exampreplab.ashershores.com')).toEqual({
      api: 'https://abc.execute-api.us-west-1.amazonaws.com/',
      auth: {
        domain: 'https://exampreplab-admin.auth.us-west-1.amazoncognito.com',
        clientId: 'client123',
        redirectUri: 'https://exampreplab.ashershores.com/admin',
      },
    });
  });

  it.each(['VITE_ACTIVITY_API', 'VITE_COGNITO_DOMAIN', 'VITE_COGNITO_CLIENT_ID'])('is null when %s is missing', (key) => {
    expect(readAdminConfig({ ...ENV, [key]: '' }, 'http://localhost:5173')).toBeNull();
  });

  it('refuses a non-https Cognito domain or API', () => {
    expect(readAdminConfig({ ...ENV, VITE_COGNITO_DOMAIN: 'http://evil.test' }, 'http://localhost:5173')).toBeNull();
    expect(readAdminConfig({ ...ENV, VITE_ACTIVITY_API: 'http://evil.test' }, 'http://localhost:5173')).toBeNull();
  });
});
