const fs = require('fs');
const file = 'src/editor/canonicalSvg.ts';
const lines = fs.readFileSync(file, 'utf8').split('\n');
const fixedLines = [...lines.slice(0, 425), ...lines.slice(472)];
fs.writeFileSync(file, fixedLines.join('\n'));
console.log('Fixed canonicalSvg.ts');
