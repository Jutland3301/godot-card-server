"use strict";

const { clampStability, normalizeInt } = require("./aircraft_rules");

function findRandomHealthyCrew(player, rng) {
  const healthy = player.crew.filter((crew) => crew && !crew.injured && crew.hp > 0);
  if (healthy.length === 0) return null;
  return healthy[Math.floor(rng() * healthy.length)];
}

function dealDamageToPart(state, ownerPlayer, part, rawDamage, sourceText, rng = Math.random) {
  const damage = Math.max(0, normalizeInt(rawDamage, 0));
  const actualDamage = Math.max(0, damage - normalizeInt(part.armor, 0));
  const beforeHp = part.hp;
  part.hp = Math.max(0, part.hp - actualDamage);
  const partDestroyed = beforeHp > 0 && part.hp <= 0;
  const fullHpDamage = actualDamage > 0 ? Math.max(1, Math.floor(actualDamage / 2)) : 0;
  ownerPlayer.full_hp = Math.max(0, ownerPlayer.full_hp - fullHpDamage);

  const logLines = [`${sourceText} dealt ${actualDamage} damage to ${ownerPlayer.aircraft_name} ${part.part_name}.`];

  if (partDestroyed) {
    part.destroyed = true;
    part.disabled = Boolean(part.can_be_disabled);
    logLines.push(`${ownerPlayer.aircraft_name} ${part.part_name} was destroyed.`);
    if (part.part_name.includes("Engine")) {
      ownerPlayer.full_hp = Math.max(0, ownerPlayer.full_hp - 8);
      ownerPlayer.stability -= 10;
      logLines.push("Engine loss caused 8 full HP damage and -10 stability.");
    } else if (part.part_name.includes("Wing")) {
      ownerPlayer.stability -= 18;
      const weapon = ownerPlayer.weapons.find((item) => item && !item.disabled);
      if (weapon) weapon.disabled = true;
      logLines.push("Wing loss caused -18 stability and disabled one weapon.");
    } else if (part.part_name.includes("Tail")) {
      ownerPlayer.stability -= 22;
      logLines.push("Tail loss caused -22 stability.");
    }
  }

  if (part.part_name.includes("Fuselage") && actualDamage > 0 && rng() < 0.25) {
    const crew = findRandomHealthyCrew(ownerPlayer, rng);
    if (crew) {
      crew.injured = true;
      crew.status = "injured";
      crew.hp = Math.max(0, crew.hp - 1);
      logLines.push(`${crew.name} was injured by fuselage damage.`);
    }
  }

  clampStability(ownerPlayer);
  return {
    actual_damage: actualDamage,
    full_hp_damage: fullHpDamage,
    part_destroyed: partDestroyed,
    log_lines: logLines,
  };
}

module.exports = { dealDamageToPart };
