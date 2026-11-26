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

function findEditable(xml) {
  const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map((m) => m[0]);
  const edits = [];
  for (const node of nodes) {
    if (!/class="android.widget.EditText"/.test(node)) continue;
    const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!bounds) continue;
    edits.push({
      text: (node.match(/text="([^"]*)"/) || [])[1] || '',
      x: Math.floor((+bounds[1] + +bounds[3]) / 2),
      y: Math.floor((+bounds[2] + +bounds[4]) / 2),
    });
  }
  return edits;
}

function texts(xml) {
  return [...new Set([...xml.matchAll(/text="([^"]*)"/g)].map((m) => m[1]).filter(Boolean))];
}

function clearAndType(hit, value) {
  sh(`adb shell input tap ${hit.x} ${hit.y}`);
  sleep(250);
  // Select-all + delete repeatedly, then type
  for (let i = 0; i < 3; i += 1) {
    sh('adb shell input keyevent KEYCODE_MOVE_END');
    sh('adb shell input keyevent --longpress KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL KEYCODE_DEL');
  }
  sleep(200);
  sh(`adb shell input text ${value}`);
  sleep(300);
}

let xml = dumpUi();
if (xml.includes('Back to Login')) {
  const back = findTap('Back to Login', xml);
  if (back) {
    sh(`adb shell input tap ${back.x} ${back.y}`);
    sleep(1500);
    xml = dumpUi();
  }
}

if (/Sign in to continue/.test(xml)) {
  const edits = findEditable(xml);
  if (edits.length < 2) {
    console.log(JSON.stringify({ status: 'FAIL', reason: 'login fields missing', ui: texts(xml) }, null, 2));
    process.exit(1);
  }
  clearAndType(edits[0], 'WEB0008');
  clearAndType(edits[1], '12345678');
  xml = dumpUi();
  const login = findTap('Login', xml);
  if (!login) {
    console.log(JSON.stringify({ status: 'FAIL', reason: 'Login missing', ui: texts(xml) }, null, 2));
    process.exit(1);
  }
  sh(`adb shell input tap ${login.x} ${login.y}`);
  sleep(10000);
  xml = dumpUi();
}

if (/Sign in to continue|Forgot your password|Back to Login/.test(xml)) {
  console.log(JSON.stringify({ status: 'FAIL', reason: 'auth failed', ui: texts(xml) }, null, 2));
  process.exit(1);
}

if (!xml.includes('Close drawer')) {
  const menu = findTap('Open menu', xml) || { x: 66, y: 160 };
  sh(`adb shell input tap ${menu.x} ${menu.y}`);
  sleep(2000);
  xml = dumpUi();
}

const att = findTap('My Attendance', xml);
if (!att) {
  console.log(JSON.stringify({ status: 'FAIL', reason: 'My Attendance missing', drawer: texts(xml) }, null, 2));
  process.exit(1);
}
sh(`adb shell input tap ${att.x} ${att.y}`);
sleep(14000);
xml = dumpUi();
sh('adb shell input swipe 360 1400 360 450 300');
sleep(1200);
const xml2 = dumpUi();
const ui = [...new Set(texts(xml).concat(texts(xml2)))];

const flags = {
  hasError: ui.some((t) => /Could not|Failed to load|Something went wrong|ReferenceError|TypeError|Assignment to constant/i.test(t)),
  hasEmpty: ui.some((t) => /No attendance records|No records found/i.test(t)),
  hasLoading: ui.some((t) => /Loading attendance/i.test(t)),
  hasDateRows: ui.some((t) => /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(t)),
  totalDaysIndex: ui.findIndex((t) => t === 'Total Days'),
};
if (flags.totalDaysIndex >= 0) {
  flags.totalDaysValue = ui[flags.totalDaysIndex + 1];
}

const ok = !flags.hasError && !flags.hasEmpty && (flags.hasDateRows || (flags.totalDaysValue && flags.totalDaysValue !== '0'));
console.log(JSON.stringify({ status: ok ? 'OK' : 'FAIL', flags, ui }, null, 2));
process.exit(ok ? 0 : 2);
