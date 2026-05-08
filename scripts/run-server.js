'use strict';

const { startLocalBackend } = require('../src/server');

startLocalBackend().then((server) => {
  console.log(`musiQ Express backend running at ${server.url}`);
  console.log(`SQLite database: ${server.dbPath}`);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
