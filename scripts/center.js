const fs = require('fs');
const xml = fs.readFileSync(process.argv[2], 'utf8');
const want = (process.argv[3] || '').toLowerCase();
const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map(m => m[0]);
for (const node of nodes) {
  if (!/clickable="true"/.test(node)) continue;
  const text = (node.match(/text="([^"]*)"/) || [])[1] || '';
  const desc = (node.match(/content-desc="([^"]*)"/) || [])[1] || '';
  const label = desc || text;
  if (label.toLowerCase() !== want) continue;
  const bounds = (node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/) || []).slice(1).map(Number);
  if (bounds.length !== 4 || bounds[2] === 0) continue;
  const x = Math.round((bounds[0] + bounds[2]) / 2);
  const y = Math.round((bounds[1] + bounds[3]) / 2);
  console.log(`${x} ${y}`);
  process.exit(0);
}
process.exit(1);
