'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const electronBin = require('electron');
const serverEntry = path.join(__dirname, '..', 'src', 'server', 'index.js');

const child = spawn(electronBin, [serverEntry], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1'
  }
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
