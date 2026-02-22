const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Watch the shared directory outside mobile/
config.watchFolders = [path.resolve(workspaceRoot, 'shared')];

// Allow Metro to resolve files from shared/
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Resolve @shared/* alias
config.resolver.extraNodeModules = {
  '@shared': path.resolve(workspaceRoot, 'shared'),
};

module.exports = config;
