import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { authorizeUrl, getPublicUrl, getRedirectUri, isDemoMode } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = await getPublicUrl();

  // en mode démo, la session admin est automatique : on va droit au panel
  if (isDemoMode()) return NextResponse.redirect(`${base}/`);

  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.redirect(`${base}/login?error=config`);
  }

  const state = randomBytes(16).toString('hex');
  const url = authorizeUrl(clientId, await getRedirectUri(), state);

  const res = NextResponse.redirect(url);
  res.cookies.set('limerence_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });
  return res;
}
