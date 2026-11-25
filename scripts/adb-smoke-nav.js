const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCREENS = [
  'My Attendance',
  'Leaves',
  'My Notes',
  'Policy',
  'Tickets',
  'Tasks',
  'Studio Bookings',
  'Feedback',
  'Projects',
  'Resources',
  'Department',
  'Positions',
  'Notifications',
  'Profile',
  'Dashboard',
];

const dumpPath = path.join(os.tmpdir(), 'oms-smoke.xml');

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
  const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map(m => m[0]);
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

function openDrawer(xml) {
  if (xml.includes('Close drawer')) return xml;
  const hit = findTap('Open menu', xml) || { x: 66, y: 160 };
  sh(`adb shell input tap ${hit.x} ${hit.y}`);
  sleep(2000);
  return dumpUi();
}

function screenSignals(xml) {
  const bad = [];
  if (/Could not|Failed to load|Something went wrong|Syntax Error|Failed to compile/i.test(xml)) bad.push('error-banner');
  const texts = [...xml.matchAll(/text="([^"]*)"/g)].map(m => m[1]).filter(Boolean);
  const title = texts.find(t => t.length > 2 && t.length < 60) || '(no title)';
  return { title, bad, hasLoading: /Loading/i.test(xml) };
}

function ensureLoggedIn() {
  const xml = dumpUi();
  if (/Sign in to continue/.test(xml)) {
    const idField = findTap('Enter your Employee ID or Email', xml) || { x: 360, y: 460 };
    sh(`adb shell input tap ${idField.x} ${idField.y}`);
    sleep(300);
    sh('adb shell input text WEB0008');
    const pwField = findTap('Enter your password', xml) || { x: 360, y: 652 };
    sh(`adb shell input tap ${pwField.x} ${pwField.y}`);
    sleep(300);
    sh('adb shell input text 12345678');
    const login = findTap('Login', xml) || { x: 360, y: 784 };
    sh(`adb shell input tap ${login.x} ${login.y}`);
    sleep(8000);
  }
}

const results = [];
ensureLoggedIn();

for (const screen of SCREENS) {
  try {
    let xml = dumpUi();
    xml = openDrawer(xml);
    const tap = findTap(screen, xml);
    if (!tap) {
      results.push({ screen, status: 'SKIP', note: 'not in drawer' });
      continue;
    }
    sh(`adb shell input tap ${tap.x} ${tap.y}`);
    sleep(6000);
    xml = dumpUi();
    const sig = screenSignals(xml);
    results.push({
      screen,
      status: sig.bad.length ? 'FAIL' : 'OK',
      note: sig.bad.join(',') || sig.title.slice(0, 40),
    });
    // Stay logged in; next screen opens from drawer.
  } catch (e) {
    results.push({ screen, status: 'ERR', note: String(e.message || e).slice(0, 80) });
  }
}

console.log(JSON.stringify(results, null, 2));