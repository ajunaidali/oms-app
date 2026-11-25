/**
 * Measures cold start and screen launch times via ADB.
 * Usage: node scripts/measure-android-perf.js [package] [component]
 */
const { execSync } = require('child_process');

const pkg = process.argv[2] || 'com.ots.management';
const activity = process.argv[3] || `${pkg}/.MainActivity`;

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function coldStart() {
  sh(`adb shell am force-stop ${pkg}`);
  const out = sh(`adb shell am start -W -n ${activity}`);
  const total = out.match(/TotalTime:\s*(\d+)/);
  const wait = out.match(/WaitTime:\s*(\d+)/);
  return {
    totalMs: total ? Number(total[1]) : null,
    waitMs: wait ? Number(wait[1]) : null,
    raw: out,
  };
}

function main() {
  console.log('Device:', sh('adb shell getprop ro.product.model'));
  const start = coldStart();
  console.log('\nCold start:');
  console.log(`  TotalTime: ${start.totalMs ?? '?'} ms`);
  console.log(`  WaitTime:  ${start.waitMs ?? '?'} ms`);
}

main();