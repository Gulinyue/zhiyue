const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

// Configure the data location before modules construct their electron-store instances.
app.setName('Climb Local');
if (process.env.CLIMB_USER_DATA_DIR) {
  const directory = path.resolve(process.env.CLIMB_USER_DATA_DIR);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath('userData', directory);
}
require('./runtime.cjs');
