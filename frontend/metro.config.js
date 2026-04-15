const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// Resolve the real path to avoid issues with virtual drives (e.g. subst Z:)
const projectRoot = path.resolve(__dirname);

module.exports = mergeConfig(getDefaultConfig(projectRoot), {
  projectRoot,
  watchFolders: [projectRoot],
});
