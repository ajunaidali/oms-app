const fs = require('fs');
const file = process.argv[2];
const xml = fs.readFileSync(file, 'utf8');
const texts = [...xml.matchAll(/text="([^"]*)"/g)].map(m => m[1]).filter(Boolean);
const desc = [...xml.matchAll(/content-desc="([^"]*)"/g)].map(m => m[1]).filter(Boolean);
console.log([...new Set(texts.concat(desc))].join('\n'));
