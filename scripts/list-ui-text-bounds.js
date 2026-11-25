const fs = require('fs');
const xml = fs.readFileSync(process.argv[2], 'utf8');
const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
let m;
const rows = [];
while ((m = re.exec(xml))) {
  if (m[1]) rows.push({ t: m[1], y1: +m[3], y2: +m[5] });
}
rows.sort((a, b) => a.y1 - b.y1).forEach(r => console.log(`${r.t} => y ${r.y1}-${r.y2}`));