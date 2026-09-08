// Lavalink node configuration.
//
// Nodes can be supplied in three ways, checked in this order of precedence:
//   1. LAVALINK_NODES        - a JSON array (or { "nodes": [...] } object) of node configs, e.g.
//                               '[{"host":"lavalink.example.com","port":443,"password":"secret","secure":true,"name":"Main"}]'
//   2. LAVALINK_NODES_FILE   - path to a JSON file with the same shape as LAVALINK_NODES
//                               (defaults to lavalink/nodes.json at the project root if present)
//   3. LAVALINK_HOST/PORT/PASSWORD/SECURE/NAME - a single node built from individual env vars
//
// Additional environment variables:
//   LAVALINK_SEARCH_PLATFORM  - default search prefix used when resolving bare queries (default: ytmsearch)
//   LAVALINK_REST_VERSION     - Lavalink REST/WS protocol version (default: v4)
//   LAVALINK_ENABLE_FALLBACK  - "true"/"1"/"yes" to append a known-working public Lavalink node
//                               to the end of the node list as a last resort. Public nodes are
//                               community-run, unauthenticated, and NOT guaranteed to be stable or
//                               secure — use only as a temporary fallback while you set up your own
//                               Lavalink server. Defaults to disabled.
//   LAVALINK_FALLBACK_HOST/PORT/PASSWORD/SECURE/NAME - override the built-in fallback node's details.
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// A publicly known Lavalink node, used only as an opt-in fallback when no other
// nodes are configured/available. Public nodes can disappear or change credentials
// at any time — do not rely on this for production use.
const PUBLIC_FALLBACK_NODE = {
    host: process.env.LAVALINK_FALLBACK_HOST || 'lavalink.jirayu.net',
    port: Number(process.env.LAVALINK_FALLBACK_PORT || 13592),
    password: process.env.LAVALINK_FALLBACK_PASSWORD || 'youshallnotpass',
    secure: parseBoolean(process.env.LAVALINK_FALLBACK_SECURE, false),
    name: process.env.LAVALINK_FALLBACK_NAME || 'PublicFallback',
};

function parseBoolean(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

function parseNodesFromEnv() {
    const raw = process.env.LAVALINK_NODES?.trim();
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function parseNodesPayload(parsed) {
    if (Array.isArray(parsed)) {
        return parsed;
    }
    if (Array.isArray(parsed?.nodes)) {
        return parsed.nodes;
    }
    return null;
}

function loadNodesFromFile() {
    const nodesFile = process.env.LAVALINK_NODES_FILE?.trim()
        || path.join(projectRoot, 'lavalink', 'nodes.json');

    if (!existsSync(nodesFile)) {
        return null;
    }

    try {
        const parsed = JSON.parse(readFileSync(nodesFile, 'utf8'));
        return parseNodesPayload(parsed);
    } catch {
        return null;
    }
}

function withFallbackNode(nodes) {
    const enableFallback = parseBoolean(process.env.LAVALINK_ENABLE_FALLBACK, false);
    if (!enableFallback) {
        return nodes;
    }

    const alreadyPresent = nodes.some(
        (node) => node?.host === PUBLIC_FALLBACK_NODE.host && Number(node?.port) === PUBLIC_FALLBACK_NODE.port,
    );

    if (alreadyPresent) {
        return nodes;
    }

    return [...nodes, PUBLIC_FALLBACK_NODE];
}

export function getLavalinkNodes() {
    const fromJson = parseNodesFromEnv();
    if (fromJson?.length) {
        return withFallbackNode(fromJson);
    }

    const fromFile = loadNodesFromFile();
    if (fromFile?.length) {
        return withFallbackNode(fromFile);
    }

    const host = process.env.LAVALINK_HOST || 'localhost';
    const port = Number(process.env.LAVALINK_PORT || 2333);
    const password = process.env.LAVALINK_PASSWORD || 'youshallnotpass';
    const secure = parseBoolean(process.env.LAVALINK_SECURE, false);

    return withFallbackNode([{
        host,
        port,
        password,
        secure,
        name: process.env.LAVALINK_NAME || 'Main',
    }]);
}

export const lavalinkConfig = {
    nodes: getLavalinkNodes(),
    defaultSearchPlatform: process.env.LAVALINK_SEARCH_PLATFORM || 'ytmsearch',
    restVersion: process.env.LAVALINK_REST_VERSION || 'v4',
};

export default lavalinkConfig;
