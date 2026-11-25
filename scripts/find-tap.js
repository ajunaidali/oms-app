const fs = require('fs');
const xml = fs.readFileSync(process.argv[2], 'utf8');
const label = process.argv[3];
const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map(m => m[0]);
for (const node of nodes) {
  const text = (node.match(/text="([^"]*)"/) || [])[1] || '';
  if (text !== label) continue;
  const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) continue;
  console.log(Math.floor((+bounds[1] + +bounds[3]) / 2), Math.floor((+bounds[2] + +bounds[4]) / 2));
  process.exit(0);
}
process.exit(1);