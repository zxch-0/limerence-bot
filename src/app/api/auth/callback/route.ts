import { NextResponse, type NextRequest } from 'next/server';
import {
  avatarUrl,
  createSession,
  exchangeCode,
  fetchOAuthUser,
  getPublicUrl,
  userCanAdminGuild,
} from '@/lib/auth';
import { addLog } from '@/lib/logs';
import { getState } from '@/lib/store';
import { getGuild } from '@/lib/discord/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const base = await getPublicUrl();
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = req.cookies.get('limerence_oauth_state')?.value;

  if (url.searchParams.get('error')) {
    return NextResponse.redirect(`${base}/login?error=refus`);
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(`${base}/login?error=state`);
  }

  try {
    const token = await exchangeCode(code);
    const user = await fetchOAuthUser(token.access_token);

    const state_ = await getState();
    const botGuild = !state_.config.guildId && !process.env.DISCORD_GUILD_ID ? await getGuild(false) : null;
    const targetGuildId = state_.config.guildId ?? process.env.DISCORD_GUILD_ID ?? botGuild?.id ?? null;
    const isAdmin = await userCanAdminGuild(token.access_token, targetGuildId, user.id);

    if (!isAdmin) {
      return NextResponse.redirect(`${base}/login?error=permissions`);
    }

    await createSession({
      id: user.id,
      username: user.username,
      globalName: user.global_name ?? undefined,
      avatarUrl: avatarUrl(user),
      isAdmin: true,
    });

    await addLog({
      level: 'info',
      source: `panel:${user.username}`,
      action: 'Connexion au panel',
    });

    const res = NextResponse.redirect(`${base}/`);
    res.cookies.delete('limerence_oauth_state');
    return res;
  } catch (err) {
    console.error('[auth] callback échoué :', (err as Error).message);
    return NextResponse.redirect(`${base}/login?error=oauth`);
  }
}
