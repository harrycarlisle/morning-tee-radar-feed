const fs = require("fs");
const path = require("path");

const API_KEY = process.env.DATAGOLF_API_KEY;

if (!API_KEY) {
  throw new Error("Missing DATAGOLF_API_KEY environment variable.");
}

function slugify(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function main() {
  const url = `https://feeds.datagolf.com/get-player-list?file_format=json&key=${API_KEY}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`DataGolf request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const rows = Array.isArray(data) ? data : data.players || data.data || [];

  const players = rows
    .map((row) => {
      const rawName = row.player_name || row.name;
      const dgId = row.dg_id || row.player_id;

      if (!rawName || !dgId) return null;

      const parts = String(rawName).split(",").map((part) => part.trim());
      const displayName = parts.length === 2 ? `${parts[1]} ${parts[0]}` : rawName;

      return {
        name: displayName,
        slug: slugify(displayName),
        dgId: Number(dgId),
        country: row.country || row.country_code || null
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const outputPath = path.join(process.cwd(), "data", "h2h", "players.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(players, null, 2));

  console.log(`[H2H] Wrote ${players.length} players to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
