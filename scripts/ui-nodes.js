const fs = require('fs');
const xml = fs.readFileSync(process.argv[2], 'utf8');
const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map(m => m[0]);
for (const node of nodes) {
  const text = (node.match(/text="([^"]*)"/) || [])[1] || '';
  const desc = (node.match(/content-desc="([^"]*)"/) || [])[1] || '';
  const clickable = /clickable="true"/.test(node);
  const bounds = (node.match(/bounds="([^"]*)"/) || [])[1] || '';
  const label = desc || text;
  if (!label) continue;
  if (process.argv[3] === 'all' || clickable) {
    console.log(`${clickable ? 'BTN' : 'TXT'} ${bounds} ${label}`);
  }
}
