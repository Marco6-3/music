'use strict';

// Base class for all music source providers.
class BaseProvider {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
    this.enabled = options.enabled !== false;
  }

  async search(platform, keyword, count = 30) {
    throw new Error(`Provider[${this.name}].search() not implemented`);
  }

  async url(song, quality = '320') {
    throw new Error(`Provider[${this.name}].url() not implemented`);
  }

  async lyric(song) {
    throw new Error(`Provider[${this.name}].lyric() not implemented`);
  }

  async pic(song, size = 300) {
    throw new Error(`Provider[${this.name}].pic() not implemented`);
  }

  async proxy(types, params) {
    throw new Error(`Provider[${this.name}].proxy() not implemented`);
  }
}

module.exports = { BaseProvider };
