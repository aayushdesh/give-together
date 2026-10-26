import { OAuth2Client } from 'google-auth-library';

export function createGoogleVerifier(client = new OAuth2Client()) {
  return async (credential, clientId, nonce) => {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload || typeof payload.sub !== 'string' || !payload.sub || payload.nonce !== nonce) {
      throw new Error('Invalid Google sign-in');
    }
    return { sub: payload.sub, nonce: payload.nonce };
  };
}
export const verifyGoogleCredential = createGoogleVerifier();
