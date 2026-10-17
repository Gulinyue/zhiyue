// 知跃 / Zhiyue · Developed by gulinyue. See LICENSE.
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');
const { BRAND } = require('./brand.cjs');

// Configure the data location before modules construct their electron-store instances.
app.setName(BRAND.name);
if (process.platform === 'win32') app.setAppUserModelId(BRAND.appId);
if (process.env.ZHIYUE_USER_DATA_DIR || process.env.CLIMB_USER_DATA_DIR) {
  const directory = path.resolve(process.env.ZHIYUE_USER_DATA_DIR || process.env.CLIMB_USER_DATA_DIR);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath('userData', directory);
}
require('./runtime.cjs');
