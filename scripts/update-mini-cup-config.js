const fs = require("fs");

const schedulePath = "mini-cup-schedule.json";
const configPath = "mini-cup-config.json";

function todayIsoDate() {
  const override = process.env.MINI_CUP_DATE;
  if (override) return override.slice(0, 10);

  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function isActive(rule, today) {
  if (rule.enabled === false) return false;
  if (!rule.activateStart || !rule.activateEnd) return false;

  return today >= rule.activateStart && today < rule.activateEnd;
}

function buildConfig(rule, fallback) {
  if (!rule) {
    return {
      ...fallback,
      updatedAt: new Date().toISOString()
    };
  }

  return {
    activeMode: rule.activeMode || "default",
    updatedAt: new Date().toISOString(),
    label: rule.label || fallback.label || "Mini Cup",
    teamA: rule.teamA || fallback.teamA,
    teamB: rule.teamB || fallback.teamB
  };
}

const schedule = JSON.parse(fs.readFileSync(schedulePath, "utf8"));
const fallback = schedule.defaultConfig;

const today = todayIsoDate();
const activeRule = (schedule.rules || []).find((rule) => isActive(rule, today));
const config = buildConfig(activeRule, fallback);

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

console.log(`Mini Cup config updated for ${today}.`);
console.log(`Active mode: ${config.activeMode}`);
console.log(`Label: ${config.label}`);
console.log(`${config.teamA.name} vs ${config.teamB.name}`);
