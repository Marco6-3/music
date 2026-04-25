'use strict';

const { runElectronNode } = require('./electron-node');

runElectronNode('src/server/index.js', process.argv.slice(2));
