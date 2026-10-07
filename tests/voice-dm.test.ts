import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageFlags, PermissionFlagsBits, type Guild, type Interaction } from 'discord.js';
import { isStaff, isStaffIn, replyFlags, resolveInteractionGuild } from '../src/bot/guards';

// ============================================================
//  Contrôle des salons vocaux temporaires depuis un MP.
//
//  Le panneau de contrôle est envoyé en message privé au
//  propriétaire du salon : les interactions qui en proviennent
//  n'ont ni `guild` ni `memberPermissions`.
// ============================================================

const GUILD_ID = '123456789012345678';
const OWNER = '999999999999999999';

/** Interaction reçue sur un serveur, avec des permissions de membre. */
function guildInteraction(options: { admin?: boolean; userId?: string } = {}) {
  return {
    guildId: GUILD_ID,
    guild: { id: GUILD_ID, name: 'Serveur' },
    user: { id: options.userId ?? '111111111111111111' },
    inGuild: () => true,
    memberPermissions: {
      has: (permission: bigint) =>
        options.admin ? permission === PermissionFlagsBits.Administrator : false,
    },
  } as unknown as Interaction;
}

/** Interaction reçue en MP : pas de serveur, pas de permissions. */
function dmInteraction(options: { userId?: string } = {}) {
  return {
    guildId: null,
    guild: null,
    user: { id: options.userId ?? '111111111111111111' },
    inGuild: () => false,
    memberPermissions: null,
  } as unknown as Interaction;
}

/** Serveur factice dont on contrôle les permissions du membre. */
function fakeGuild(hasPermission: boolean): Guild {
  return {
    id: GUILD_ID,
    members: {
      fetch: async () => ({
        id: '111111111111111111',
        permissions: { has: () => hasPermission },
      }),
    },
  } as unknown as Guild;
}

test('replyFlags : éphémère sur un serveur, réponse normale en MP', () => {
  assert.deepEqual(replyFlags(guildInteraction()), { flags: MessageFlags.Ephemeral });
  assert.deepEqual(replyFlags(dmInteraction()), {}, 'aucun drapeau éphémère en MP');
});

test('isStaff reconnaît l’owner et les admins de l’env même en MP', () => {
  const previousOwner = process.env.OWNER_DISCORD_ID;
  const previousAdmins = process.env.ADMIN_DISCORD_IDS;
  try {
    process.env.OWNER_DISCORD_ID = OWNER;
    process.env.ADMIN_DISCORD_IDS = '';
    assert.equal(isStaff(dmInteraction({ userId: OWNER })), true, 'l’owner reste admin en MP');
    assert.equal(isStaff(guildInteraction({ admin: true })), true, 'permission Gérer le serveur');
    assert.equal(isStaff(dmInteraction()), false, 'un membre lambda en MP n’est pas admin');

    process.env.ADMIN_DISCORD_IDS = '222222222222222222, 333333333333333333';
    assert.equal(isStaff(dmInteraction({ userId: '333333333333333333' })), true, 'ID autorisé par l’env');
  } finally {
    if (previousOwner === undefined) delete process.env.OWNER_DISCORD_ID;
    else process.env.OWNER_DISCORD_ID = previousOwner;
    if (previousAdmins === undefined) delete process.env.ADMIN_DISCORD_IDS;
    else process.env.ADMIN_DISCORD_IDS = previousAdmins;
  }
});

test('isStaffIn relit les permissions sur le serveur quand l’interaction vient d’un MP', async () => {
  // en MP, aucune permission n'est attachée à l'interaction
  assert.equal(await isStaffIn(dmInteraction(), fakeGuild(true)), true, 'admin du serveur reconnu depuis un MP');
  assert.equal(await isStaffIn(dmInteraction(), fakeGuild(false)), false, 'membre simple refusé');
  assert.equal(await isStaffIn(dmInteraction(), null), false, 'sans serveur, personne n’est admin');

  // sur le serveur, les permissions de l'interaction suffisent
  assert.equal(await isStaffIn(guildInteraction({ admin: true }), null), true);
});

test('resolveInteractionGuild retrouve le serveur depuis un MP', async () => {
  const guild = { id: GUILD_ID, name: 'Serveur' } as unknown as Guild;
  const fromGuild = {
    guildId: GUILD_ID,
    guild,
    inGuild: () => true,
  } as unknown as Interaction;

  assert.equal(await resolveInteractionGuild(fromGuild), guild, 'sur le serveur, on garde celui de l’interaction');

  // Sans client Discord connecté (cas des tests), un MP ne peut pas
  // deviner le serveur : la fonction renvoie null au lieu de planter.
  assert.equal(await resolveInteractionGuild(dmInteraction()), null);
});
