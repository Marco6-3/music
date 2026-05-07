'use strict';

const { BaseProvider } = require('./base');
const { GdstudioProvider } = require('./gdstudio');
const { UnmProvider } = require('./unm');
const { MetingProvider } = require('./meting');
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
    providers.push(new UnmProvider(config.unm));
  }

  return new Dispatcher(providers, { strategy: config.strategy || 'fallback' });
}

module.exports = {
  BaseProvider,
  GdstudioProvider,
  UnmProvider,
  MetingProvider,
  Dispatcher,
  createDefaultDispatcher
};
