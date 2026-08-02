import { readFile } from "node:fs/promises";
import process from "node:process";

const workerUrl = (process.env.WORKER_URL || "").replace(/\/$/, "");
const adminSecret = process.env.ADMIN_SECRET || "";
const seedFile = process.env.SEED_CODES_FILE || ".seed-codes.json";

if (!workerUrl || !adminSecret) {
  console.error("WORKER_URL and ADMIN_SECRET environment variables are required.");
  process.exit(1);
}

let rawSeedData;
try {
  rawSeedData = await readFile(seedFile, "utf8");
} catch (error) {
  console.error(`Cannot read seed file ${seedFile}: ${error.message}`);
  process.exit(1);
}

let seedData;
try {
  seedData = JSON.parse(rawSeedData);
} catch (error) {
  console.error(`Seed file ${seedFile} is not valid JSON: ${error.message}`);
  process.exit(1);
}

const entries = Array.isArray(seedData) ? seedData : seedData.codes;
if (!Array.isArray(entries) || entries.length === 0) {
  console.error("Seed file must contain a non-empty array or a {\"codes\": [...]} object.");
  process.exit(1);
}

let failures = 0;
for (const entry of entries) {
  const payload = typeof entry === "string" ? { code: entry, source: "initial-seed" } : entry;
  if (!payload || typeof payload.code !== "string") {
    console.error("Skipping an invalid seed entry without a code field.");
    failures += 1;
    continue;
  }

  try {
    const response = await fetch(`${workerUrl}/add-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminSecret}`,
      },
      body: JSON.stringify(payload),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok || responseBody.success !== true) {
      throw new Error(responseBody.error || `HTTP ${response.status}`);
    }
    console.log(`Seeded access code: ${responseBody.code}`);
  } catch (error) {
    console.error(`Failed to seed an access code: ${error.message}`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`Seeding completed with ${failures} failure(s).`);
  process.exit(1);
}

console.log(`Successfully seeded ${entries.length} access code(s).`);
