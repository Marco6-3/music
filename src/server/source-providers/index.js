'use strict';

const { BaseProvider } = require('./base');
const { GdstudioProvider } = require('./gdstudio');
const { UnmProvider } = require('./unm');
const { MetingProvider } = require('./meting');
const { MiguProvider } = require('./migu');
const { LyricFallbackProvider } = require('./lyric-fallback');
const { UnmExternalProvider } = require('./unm-external');
const { LrclibProvider } = require('./lrclib');
const { KuwoDirectProvider } = require('./kuwo-direct');
const { KugouDirectProvider } = require('./kugou-direct');
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

  if (config.kuwoDirect && config.kuwoDirect.enabled !== false) {
    providers.push(new KuwoDirectProvider(config.kuwoDirect));
  }

  if (config.kugouDirect && config.kugouDirect.enabled !== false) {
    providers.push(new KugouDirectProvider(config.kugouDirect));
  }

  if (config.migu && config.migu.enabled) {
    providers.push(new MiguProvider(config.migu));
  }

  if (config.unmExternal && config.unmExternal.enabled) {
    providers.push(new UnmExternalProvider(config.unmExternal));
  }

  if (config.lrclib && config.lrclib.enabled) {
    providers.push(new LrclibProvider(config.lrclib));
  }

  return new Dispatcher(providers, { strategy: config.strategy || 'fallback' });
}

module.exports = {
  BaseProvider,
  GdstudioProvider,
  UnmProvider,
  MetingProvider,
  MiguProvider,
  LyricFallbackProvider,
  UnmExternalProvider,
  LrclibProvider,
  KuwoDirectProvider,
  KugouDirectProvider,
  Dispatcher,
  createDefaultDispatcher
};
