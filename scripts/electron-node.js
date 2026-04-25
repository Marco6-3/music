'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const electronBin = require('electron');

function runElectronNode(scriptPath, args = []) {
  const resolvedScript = path.isAbsolute(scriptPath)
    ? scriptPath
    : path.join(__dirname, '..', scriptPath);

  const child = spawn(electronBin, [resolvedScript, ...args], {
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
}

if (require.main === module) {
  const [scriptPath, ...args] = process.argv.slice(2);
  if (!scriptPath) {
    console.error('Usage: node scripts/electron-node.js <script> [...args]');
    process.exit(1);
  }
  runElectronNode(scriptPath, args);
}

module.exports = { runElectronNode };
