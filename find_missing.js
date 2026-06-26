const data = require('./champions.json');

// Collect all unique attributes from data
const attrs = new Set();
Object.values(data).forEach(c => {
  if (c.abilities) {
    Object.values(c.abilities).forEach(arr => {
      arr.forEach(spell => {
        if (spell.effects) {
          spell.effects.forEach(e => {
            if (e.leveling) {
              e.leveling.forEach(l => {
                attrs.add(l.attribute);
              });
            }
          });
        }
      });
    });
  }
});

// Current ATTRIBUTE_MAP keys
const existing = new Set([
  "Damage","Bonus Physical Damage","Physical Damage","Magic Damage","Bonus Magic Damage",
  "True Damage","Cooldown","Movement Speed","Movement Speed Duration","Silence Duration",
  "Shield","Armor","Magic Resist","Duration","Range","Slow","Healing","Mana","Cost",
  "Base Damage","Total Magic Damage","Magic Damage Per Tick","Total Minimum/Minion Damage",
  "Minimum/Minion Damage Per Tick","Total Monster Damage Cap","Monster Damage Cap Per Tick",
  "Percent Health Damage","Total Physical Damage","Physical Damage Per Tick","Total True Damage",
  "True Damage Per Tick","Damage Reduction","Shield Strength","Physical Damage Per Spin",
  "Increased Damage Per Spin","Damage Per Pass","Total Mixed Damage","Initial Flame Magic Damage",
  "Subsequent Flame Magic Damage","Total Single-Target Damage","Increased Initial Flame Minion Damage",
  "Increased Subsequent Flame Minion Damage","Disable Duration","Wall Width",
  "Bonus Damage per Stack","Maximum Bonus Damage","Total Combined Damage","Total Damage",
  "Active Damage","Passive Damage","Minimum Damage","Maximum Damage","Attack Speed",
  "Bonus Attack Speed","Armor Penetration","Magic Penetration","Stun Duration","Root Duration",
  "Knockup Duration","Slow Duration","Heal","Attack Range","Active Damage Per Second",
  "Additional Magic Damage","Apex Physical Damage","Area Magic Damage","Base Physical Damage",
  "Blade Magic Damage","Bonus Armor","Bonus Damage","Bonus Damage Per Missile",
  "Bonus Magic Resistance","Bonus Movement Speed","Bonus Physical Damage Per Spin",
  "Bonus Physical Damage per Spin","Bonus True Damage","Bonus damage","Bouncing Magic Damage",
  "Center Physical Damage","Detonation Magic Damage","Empowered Magic Damage",
  "Empowered Physical Damage","Explosion Magic Damage","Explosion Physical Damage",
  "Extra Physical Damage","Final Magic Damage","Final Physical Damage","Flame Magic Damage",
  "Frost Magic Damage","Health Regained","Ice Magic Damage","Impact Magic Damage",
  "Impact Physical Damage","Improved Magic Damage","Increase Shield","Increased Damage",
  "Initial Magic Damage","Initial Physical Damage","Initial True Damage","Max Mixed Damage",
  "Max Physical Damage","Max Physical Damage Vs Monsters","Maximum Shield","Minion Bonus Damage",
  "Minion Damage","Minion Magic Damage","Minion Physical Damage","Minimum Magic Damage",
  "Minimum Physical Damage","Missile Magic Damage","Missile Physical Damage","Mixed Damage",
  "Monster Bonus Damage","Monster Damage","Outer Physical Damage","Outer Magic Damage",
  "Outer True Damage","Percent Armor Penetration","Percent Magic Penetration",
  "Physical Damage per Packmate","Physical Damage per Shot","Primary Bonus Monster Damage",
  "Primary Physical Damage","Prowl-Enhanced Maximum Damage","Prowl-Enhanced Minimum Damage",
  "Reduced Bonus Damage","Reduced Cooldown","Reduced Damage (Handle)","Reduced Damage Per Missile",
  "Reduced Damage per Hit","Reduced Damage per Mine","Reduced Damage per Tick",
  "Reduced Damage per hit","Reduced Heal","Reduced Heal per Tick","Reduced Health Cost",
  "Reduced Minion Damage","Reduced Monster Damage","Reduced Monster Damage per hit","Reduced Slow",
  "Replicated Projectile Damage Modifier","Resistances Reduction","Resistances Reduction Per Stack",
  "Rift Duration","Rockets 2:5 Magic Damage","Rockets 6:20 Magic Damage","Root Duration Increase",
  "Second Cast Damage","Second Cast Total Damage","Second Sweetspot Damage",
  "Secondary Target Shield","Self Bonus Armor","Self Bonus Magic Resistance","Self Heal",
  "Shield to Healing","Shroud Duration","Silver Serpent Plunder","Size Increase",
  "Slash Physical Damage","Spider Effects Increase","Spiderling Bonus Attack Speed",
  "Stealth Duration","Stored Damage Increase per Stack","Strike Physical Damage",
  "Structure Bonus Damage","Subsequent Bolt Maximum Magic Damage",
  "Subsequent Bolt Minimum Magic Damage","Subsequent Increased Damage",
  "Subsequent Rocket Magic Damage","Subsequent Rocket Minion Damage","Third Cast Damage",
  "Third Cast Total Damage","Third Sweetspot Damage","Thrust Physical Damage",
  "Total Bleed Physical Damage","Total Bonus Damage","Total Bonus Magic Damage",
  "Total Bonus Physical Damage","Total Capped Monster Damage","Total Damage Per Flurry",
  "Total Damage Vs. 5 Champions","Total Enhanced Damage","Total Enhanced MR Reduction",
  "Total Enhanced Minion Damage","Total Enhanced Slow","Total Evolved Single-Target Damage",
  "Total Expanded Damage","Total Fissure Magic Damage",
  "Total HP/Mana Regeneration (per 5 Seconds)","Total Heal per Champion","Total Heal per Minion",
  "Total Heal per Monster","Total Health Regenerated","Total Increased Damage",
  "Total MR Reduction","Total Magic Damage with Fire at Will","Total Mana Restore",
  "Total Maximum Champion Damage","Total Maximum Detonation Damage","Total Maximum Magic Damage",
  "Total Maximum Minion/Monster Damage","Total Maximum Mixed Damage","Total Maximum Shield",
  "Total Minion Damage","Total Mixed Damage with Death's Daughter","Total Monster Damage",
  "Total Monster Poison Damage","Total Movement Speed Increase","Total Non-Champion Damage",
  "Total Physical Damage On Champion Hit","Total Poison Damage","Total Primary Target Shield",
  "Total Reduced Damage","Total Resistances Reduction","Total Root Duration",
  "Total Subsequent Minion Damage","Total Subsequent Non-Minion Damage","Trap Duration",
  "True Damage with Death's Daughter","Tumble Cooldown Reduction","Turret Disable Duration",
  "Turret Modified Damage Reduction","Untouchable Shadow Dash Speed","Voidling Duration",
  "Wall Health","Wall Length","Wave Interval Time","Width","Width (charge)",
  "Width (impassable wall)","Zone Duration","Physical damage","Magic damage","True damage"
]);

const missing = [...attrs].filter(a => !existing.has(a)).sort();
console.log('MISSING COUNT:', missing.length);
missing.forEach(m => console.log(m));
