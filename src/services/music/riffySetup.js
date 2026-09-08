import { createRequire } from 'module';
import { GatewayDispatchEvents } from 'discord.js';
import { logger } from '../../utils/logger.js';
import lavalinkConfig from '../../config/music/lavalink.js';
import { setupPlayerHandler } from './playerHandler.js';

const require = createRequire(import.meta.url);
const { Riffy } = require('riffy');

function hasValidNodeConfig(node) {
    return Boolean(node && node.host && node.port && node.password);
}

export function initializeMusic(client) {
    if (!lavalinkConfig.nodes?.length) {
        logger.error('No Lavalink nodes configured. Add lavalink/nodes.json, set LAVALINK_NODES, or set LAVALINK_HOST in your environment.');
        return;
    }

    const validNodes = lavalinkConfig.nodes.filter(hasValidNodeConfig);
    const invalidNodes = lavalinkConfig.nodes.filter((node) => !hasValidNodeConfig(node));

    if (invalidNodes.length) {
        logger.error(
            `Ignoring ${invalidNodes.length} misconfigured Lavalink node(s) — each node requires host, port, and password. `
            + `Offenders: ${invalidNodes.map((node) => node?.name || 'unnamed').join(', ')}`,
        );
    }

    if (!validNodes.length) {
        logger.error('No valid Lavalink nodes remain after validation. Music features will be unavailable.');
        return;
    }

    try {
        client.riffy = new Riffy(client, validNodes, {
            send: (payload) => {
                const guildId = payload.d?.guild_id;
                if (!guildId) {
                    return;
                }

                const guild = client.guilds.cache.get(guildId);
                if (guild?.shard) {
                    guild.shard.send(payload);
                    return;
                }

                const shardCount = client.ws.shards.size || 1;
                const shardId = Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
                client.ws.shards.get(shardId)?.send(payload);
            },
            defaultSearchPlatform: lavalinkConfig.defaultSearchPlatform,
            restVersion: lavalinkConfig.restVersion,
            bypassChecks: {
                nodeFetchInfo: true,
            },
        });
    } catch (error) {
        logger.error('Failed to initialize Riffy — music features will be unavailable.', error);
        client.riffy = null;
        return;
    }

    setupPlayerHandler(client);

    client.on('raw', (packet) => {
        if (
            ![
                GatewayDispatchEvents.VoiceStateUpdate,
                GatewayDispatchEvents.VoiceServerUpdate,
            ].includes(packet.t)
        ) {
            return;
        }
        client.riffy.updateVoiceState(packet);
    });

    client.riffy.on('playerError', (player, error) => {
        logger.error(`Music player error in guild ${player.guildId}:`, error);
    });

    client.riffy.on('nodeError', (node, error) => {
        logger.error(`Lavalink node "${node?.name || 'unknown'}" reported an error:`, error);
    });

    client.riffy.on('nodeDisconnect', (node) => {
        logger.error(`Lavalink node "${node?.name || 'unknown'}" disconnected. Music playback may be interrupted.`);
    });

    logger.info(`Music initialized with ${validNodes.length} Lavalink node(s).`);
}

export function initRiffyAfterReady(client) {
    if (!client.riffy || !client.user?.id) {
        return;
    }

    try {
        client.riffy.init(client.user.id);
        logger.info('Riffy voice connection manager initialized.');
    } catch (error) {
        logger.error('Riffy failed to initialize after client ready.', error);
        return;
    }

    // Give nodes a moment to connect, then warn if none are actually online.
    setTimeout(() => {
        const connectedNodes = client.riffy.nodeMap
            ? [...client.riffy.nodeMap.values()].filter((node) => node.connected)
            : [];

        if (!connectedNodes.length) {
            logger.error(
                'No Lavalink nodes are connected after initialization. '
                + 'Music commands will fail until a node comes online. '
                + 'Check LAVALINK_HOST/LAVALINK_PORT/LAVALINK_PASSWORD or lavalink/nodes.json.',
            );
        }
    }, 10_000);
}
