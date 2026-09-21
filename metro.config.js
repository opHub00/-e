const fs = require('node:fs');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const publicEnvironment = process.env.EXPO_PUBLIC_WANPANE_ENV?.trim().toLowerCase();
const requestedNamespace = process.env.WANPANE_METRO_CACHE_NAMESPACE?.trim().toLowerCase();
const namespace = requestedNamespace
  || (publicEnvironment === 'test' ? 'e2e'
    : publicEnvironment === 'staging' ? 'staging'
      : publicEnvironment === 'production' ? 'production'
        : 'default');

if (!/^[a-z0-9][a-z0-9-]*$/.test(namespace)) {
  throw new Error('INVALID_METRO_CACHE_NAMESPACE');
}

const cacheRoot = path.join(__dirname, '.cache', 'metro', namespace);
const fileMapCacheDirectory = path.join(cacheRoot, 'file-map');
fs.mkdirSync(fileMapCacheDirectory, { recursive: true });
config.cacheStores = ({ FileStore }) => [
  new FileStore({ root: path.join(cacheRoot, 'transform') }),
];
config.fileMapCacheDirectory = fileMapCacheDirectory;

module.exports = config;
