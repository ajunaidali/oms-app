const { spawnSync } = require('child_process');
const path = require('path');

const task = process.argv[2] || 'assembleDebug';
const androidDir = path.join(__dirname, '..', 'android');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const result = spawnSync(gradlew, [task], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);