const fs = require('fs');
const xml = fs.readFileSync(process.argv[2], 'utf8');
const re = /text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
let m;
while ((m = re.exec(xml))) {
  if (/Password|Login|Enter your password|Show password|Forgot|Hide password/i.test(m[1])) {
    console.log(`${m[1]} => [${m[2]},${m[3]}][${m[4]},${m[5]}]`);
  }
}
