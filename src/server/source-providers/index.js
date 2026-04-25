'use strict';

const { BaseProvider } = require('./base');
const { GdstudioProvider } = require('./gdstudio');
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

  return new Dispatcher(providers, { strategy: config.strategy || 'fallback' });
}

module.exports = {
  BaseProvider,
  GdstudioProvider,
  MetingProvider,
  Dispatcher,
  createDefaultDispatcher
};
