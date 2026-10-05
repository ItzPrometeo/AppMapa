// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Modelos 3D del avatar (assets/models/*.glb) como assets, no como código.
config.resolver.assetExts.push('glb');

module.exports = config;
