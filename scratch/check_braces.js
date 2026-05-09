const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\YOGA\\Desktop\\rescura\\src\\app\\api\\ai\\analyze-pin\\route.ts', 'utf8');
let balance = 0;
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let char of line) {
    if (char === '{') balance++;
    if (char === '}') balance--;
  }
  console.log(`${i + 1}: ${balance} | ${line.trim()}`);
}
