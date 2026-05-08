'use strict';

const { BaseProvider } = require('./base');
const { GdstudioProvider } = require('./gdstudio');
const { UnmProvider } = require('./unm');
const { MetingProvider } = require('./meting');
const { LyricFallbackProvider } = require('./lyric-fallback');
const { UnmExternalProvider } = require('./unm-external');
const { Dispatcher } = require('./dispatcher');

function createDefaultDispatcher(config = {}) {
  const providers = [];

  if (config.gdstudio && config.gdstudio.enabled !== false) {
    providers.push(new GdstudioProvider(config.gdstudio));
  }

  if (config.meting && config.meting.enabled) {
    providers.push(new MetingProvider(config.meting));
  }

  if (config.unm && config.unm.enabled) {
    const unmProvider = new UnmProvider(config.unm);
    if (config.meting && config.meting.enabled) {
      providers.push(new LyricFallbackProvider(unmProvider, new MetingProvider(config.meting)));
    } else {
      providers.push(unmProvider);
    }
  }

  if (config.unmExternal && config.unmExternal.enabled) {
    providers.push(new UnmExternalProvider(config.unmExternal));
  }

  return new Dispatcher(providers, { strategy: config.strategy || 'fallback' });
}

module.exports = {
  BaseProvider,
  GdstudioProvider,
  UnmProvider,
  MetingProvider,
  LyricFallbackProvider,
  UnmExternalProvider,
  Dispatcher,
  createDefaultDispatcher
};
