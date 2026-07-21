const fs = require('fs');
const file = 'app.js';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split(/\r?\n/);

// Keep lines 0 to 3541, and 3721 to end
const newLines = [...lines.slice(0, 3542), ...lines.slice(3721)];
fs.writeFileSync(file, newLines.join('\n'), 'utf8');
console.log('Fixed app.js by removing duplicated block.');
