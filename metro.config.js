// Extends the Expo defaults; only adds a web resolution for `node:crypto`.
//
// Metro maps `node:` builtins to an empty module on web, so `createHash` is
// undefined there. The admin rule review console runs the real review service in
// the browser (no database), and that service hashes each original candidate.
// The shim is a real SHA-256, so browser and server agree on the same digest.
//
// Native platforms keep Metro's own resolution — this only fires for web.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const baseResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'node:crypto' || moduleName === 'crypto')) {
    return { type: 'sourceFile', filePath: require.resolve('./shims/nodeCrypto.ts') };
  }
  return baseResolveRequest ? baseResolveRequest(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
