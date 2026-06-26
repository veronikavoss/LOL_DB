const fs = require('fs');
const appCode = fs.readFileSync('app.js', 'utf8');

// Mock DOM things if necessary, or just extract functions
// Actually, we can just eval it, but app.js has DOM queries.
// Let's just extract UNIT_MAP and translateUnit
const unitMapMatch = appCode.match(/const UNIT_MAP = \{([\s\S]*?)\n\};/);
if (!unitMapMatch) throw new Error("UNIT_MAP not found");
eval(`var UNIT_MAP = {${unitMapMatch[1]}};`);

function translateUnit(unit) {
  if (!unit) return '';
  if (UNIT_MAP[unit]) return UNIT_MAP[unit];
  
  let result = unit;
  for (const [eng, kor] of Object.entries(UNIT_MAP)) {
    if (result.includes(eng)) {
      result = result.replace(eng, kor);
    }
  }
  return result;
}

console.log(translateUnit("%  of target's maximum health"));
console.log(translateUnit("% per 100 bonus AD"));
console.log(translateUnit("target's maximum health"));
