const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dumpPath = path.join(os.tmpdir(), 'oms-att.xml');

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function sleep(ms) {
  execSync(`powershell -NoProfile -Command "Start-Sleep -Milliseconds ${ms}"`, { stdio: 'ignore' });
}

function dumpUi() {
  sh('adb shell uiautomator dump /sdcard/ui.xml');
  sh(`adb pull /sdcard/ui.xml "${dumpPath}"`);
  return fs.readFileSync(dumpPath, 'utf8');
}

function findTap(label, xml) {
  const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map((m) => m[0]);
  let fallback = null;
  for (const node of nodes) {
    const text = (node.match(/text="([^"]*)"/) || [])[1] || '';
    if (text !== label) continue;
    const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!bounds) continue;
    const hit = {
      x: Math.floor((+bounds[1] + +bounds[3]) / 2),
      y: Math.floor((+bounds[2] + +bounds[4]) / 2),
    };
    if (/clickable="true"/.test(node)) return hit;
    if (!fallback) fallback = hit;
  }
  return fallback;
}

function texts(xml) {
  return [...new Set([...xml.matchAll(/text="([^"]*)"/g)].map((m) => m[1]).filter(Boolean))];
}

function openDrawer(xml) {
  if (xml.includes('Close drawer')) return xml;
  const hit = findTap('Open menu', xml) || { x: 66, y: 160 };
  sh(`adb shell input tap ${hit.x} ${hit.y}`);
  sleep(2000);
  return dumpUi();
}

function ensureLoggedIn() {
  let xml = dumpUi();
  if (xml.includes('Back to Login')) {
    const back = findTap('Back to Login', xml);
    if (back) {
      sh(`adb shell input tap ${back.x} ${back.y}`);
      sleep(1500);
      xml = dumpUi();
    }
  }
  if (!/Sign in to continue/.test(xml)) return xml;

  const idField = findTap('Enter your Employee ID or Email', xml) || { x: 360, y: 460 };
  sh(`adb shell input tap ${idField.x} ${idField.y}`);
  sleep(300);
  sh('adb shell input keyevent 123'); // move end
  sh('adb shell input keyevent --etime 1 KEYCODE_MOVE_END');
  // Clear existing text then type
  sh('adb shell input keyevent KEYCODE_CTRL_LEFT KEYCODE_A');
  sleep(100);
  sh('adb shell input text WEB0008');
  sleep(400);

  const pwField = findTap('Enter your password', xml) || { x: 360, y: 652 };
  sh(`adb shell input tap ${pwField.x} ${pwField.y}`);
  sleep(300);
  sh('adb shell input text 12345678');
  sleep(400);

  xml = dumpUi();
  const login = findTap('Login', xml);
  if (!login) {
    console.log(JSON.stringify({ status: 'FAIL', reason: 'Login button missing', ui: texts(xml) }, null, 2));
    process.exit(1);
  }
  sh(`adb shell input tap ${login.x} ${login.y}`);
  sleep(9000);
  return dumpUi();
}

ensureLoggedIn();
let xml = dumpUi();
if (/Sign in to continue|Forgot your password|Back to Login/.test(xml)) {
  console.log(JSON.stringify({ status: 'FAIL', reason: 'still on auth screen', ui: texts(xml) }, null, 2));
  process.exit(1);
}

xml = openDrawer(xml);
const tap = findTap('My Attendance', xml);
if (!tap) {
  console.log(JSON.stringify({ status: 'FAIL', reason: 'My Attendance missing', drawer: texts(xml) }, null, 2));
  process.exit(1);
}
sh(`adb shell input tap ${tap.x} ${tap.y}`);
sleep(14000);
xml = dumpUi();
// Scroll to reveal table / empty state
sh('adb shell input swipe 360 1400 360 500 350');
sleep(1500);
const xml2 = dumpUi();
const ui = [...new Set(texts(xml).concat(texts(xml2)))];
const flags = {
  hasError: ui.some((t) => /Could not|Failed to load|Something went wrong|ReferenceError|TypeError|Assignment to constant/i.test(t)),
  hasEmpty: ui.some((t) => /No attendance records|No records found/i.test(t)),
  hasLoading: ui.some((t) => /Loading attendance/i.test(t)),
  hasStats: ui.some((t) => /Present Days|Total Days|Absent Days|Total Hours/i.test(t)),
  hasRows: ui.some((t) => /\b(Nov|Dec|Oct|Sep|Aug|Jul|Jun|May|Apr|Mar|Feb|Jan)\b/i.test(t) || /\d{4}-\d{2}-\d{2}/.test(t)),
  nonZeroStats: ui.some((t, i) => /^(Present Days|Late Days|Total Days)$/.test(ui[i - 1] || '') && t !== '0' && t !== '—'),
};
const ok = !flags.hasError && !flags.hasEmpty && (flags.hasRows || flags.nonZeroStats);
console.log(JSON.stringify({ status: ok ? 'OK' : 'FAIL', flags, ui }, null, 2));
process.exit(ok ? 0 : 2);
