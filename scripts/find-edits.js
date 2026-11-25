const fs=require("fs");
const path=process.argv[2];
const xml=fs.readFileSync(path,"utf8");
const re=/text="([^"]*)"[^>]*class="android.widget.EditText"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"|class="android.widget.EditText"[^>]*text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
let m; let i=0;
while((m=re.exec(xml))){
  const text=m[1]||m[6]||"";
  const a=m[2]?[m[2],m[3],m[4],m[5]]:[m[7],m[8],m[9],m[10]];
  const x=(+a[0]+ +a[2])/2|0, y=(+a[1]+ +a[3])/2|0;
  console.log(`EDIT${i} text=${JSON.stringify(text)} center=${x},${y} bounds=${a.join(",")}`);
  i++;
}
