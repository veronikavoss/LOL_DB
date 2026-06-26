const data = require('./champions.json');
const fs = require('fs');

const lines = fs.readFileSync('app.js', 'utf8');
const match = lines.match(/const ATTRIBUTE_MAP = \{([\s\S]*?)\n\};/);
if (!match) { console.log('No match'); process.exit(1); }

const mapContent = match[1];
const regex = /"([^"]+)":\s*"/g;
const ATTR = {};
let m;
while ((m = regex.exec(mapContent)) !== null) {
  ATTR[m[1]] = true;
}

const attrs = new Set();
Object.values(data).forEach(c => {
  if (c.abilities) {
    Object.values(c.abilities).forEach(arr => {
      arr.forEach(spell => {
        if (spell.effects) {
          spell.effects.forEach(e => {
            if (e.leveling) {
              e.leveling.forEach(l => { attrs.add(l.attribute); });
            }
          });
        }
      });
    });
  }
});

const missing = [...attrs].filter(a => !ATTR[a]).sort();
console.log('Still missing:', missing.length);
// Print all on single lines for complete listing
missing.forEach(m => console.log(JSON.stringify(m)));
