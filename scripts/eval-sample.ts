// Stratified Sample Generator for LLM Evaluation (scripts/eval-sample.ts)
// Draws 50 random unique posts stratified by source from PostgreSQL posts table
// Exports double-blind CSV with columns [id, title, location, description_snippet, human_role, human_city]
// LLM tags are strictly HIDDEN so evaluator can label first without bias

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

import { client } from "../lib/db";
import { ROLES, CITIES } from "../lib/config";

interface SampleRow {
  id: string;
  source: string;
  title: string;
  location_raw: string;
  description: string;
}

/**
 * Escapes text for RFC 4180 CSV compliance
 */
function escapeCsv(text: string | null | undefined): string {
  if (!text) return '""';
  const sanitized = text
    .replace(/[\r\n\t]+/g, " ") // Collapse whitespace and newlines
    .replace(/"/g, '""')        // Escape quotes
    .trim();
  return `"${sanitized}"`;
}

/**
 * Strips HTML and truncates text to clean plain-text snippet
 */
function cleanSnippet(text: string, maxLength = 320): string {
  if (!text) return "";
  const plain = text
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}...` : plain;
}

export async function generateEvalSample(outputCsvPath = "data/eval_sample.csv", totalTarget = 50) {
  console.log("=================================================");
  console.log("  📊 GENERATING STRATIFIED EVALUATION SAMPLE     ");
  console.log("=================================================");

  // 1. Get counts of unique primary posts per source
  const sourceStats = await client<Array<{ source: string; count: number }>>`
    SELECT source, COUNT(*)::int as count
    FROM posts
    WHERE is_duplicate_of IS NULL
    GROUP BY source
    ORDER BY count DESC;
  `;

  if (sourceStats.length === 0) {
    throw new Error("No unique posts found in database. Run the pipeline first.");
  }

  const totalPrimaryPosts = sourceStats.reduce((acc, s) => acc + s.count, 0);
  console.log(`Found ${totalPrimaryPosts} unique primary posts across ${sourceStats.length} sources:`);
  for (const s of sourceStats) {
    console.log(`   - ${s.source}: ${s.count} posts`);
  }

  // 2. Compute stratified sample allocation per source
  // We guarantee a minimum sample from smaller sources (e.g. at least 5 for ashby, 7 for lever)
  const allocation = new Map<string, number>();
  let remainingSlots = totalTarget;

  for (const s of sourceStats) {
    // Proportional share with at least 5 posts if source has enough
    const propShare = Math.round((s.count / totalPrimaryPosts) * totalTarget);
    const minSlots = Math.min(s.count, 5);
    const allocated = Math.max(minSlots, propShare);
    allocation.set(s.source, allocated);
  }

  // Adjust total to exactly totalTarget
  let currentSum = Array.from(allocation.values()).reduce((a, b) => a + b, 0);
  if (currentSum !== totalTarget) {
    const dominantSource = sourceStats[0].source;
    const diff = totalTarget - currentSum;
    allocation.set(dominantSource, (allocation.get(dominantSource) || 0) + diff);
  }

  console.log("\nStratified Sample Allocation (Total: 50 posts):");
  for (const [source, count] of allocation.entries()) {
    console.log(`   - ${source}: ${count} posts`);
  }

  // 3. Draw random records per stratum from PostgreSQL
  const sampledRows: SampleRow[] = [];

  for (const [source, count] of allocation.entries()) {
    const rows = await client<SampleRow[]>`
      SELECT id, source, title, location_raw, description
      FROM posts
      WHERE is_duplicate_of IS NULL AND source = ${source}
      ORDER BY RANDOM()
      LIMIT ${count};
    `;
    sampledRows.push(...rows);
  }

  // Shuffle combined array for double-blind randomness
  sampledRows.sort(() => Math.random() - 0.5);

  // 4. Format as double-blind CSV (LLM tags HIDDEN)
  const csvHeaders = ["id", "title", "location", "description_snippet", "human_role", "human_city"];
  const csvLines = [csvHeaders.join(",")];

  for (const row of sampledRows) {
    const snippet = cleanSnippet(row.description);
    const line = [
      escapeCsv(row.id),
      escapeCsv(row.title),
      escapeCsv(row.location_raw),
      escapeCsv(snippet),
      '""', // human_role (empty for human annotation)
      '""', // human_city (empty for human annotation)
    ].join(",");
    csvLines.push(line);
  }

  // 5. Ensure target directory exists and write CSV
  const resolvedPath = path.resolve(process.cwd(), outputCsvPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, csvLines.join("\n"), "utf-8");

  console.log(`\n✅ Successfully exported ${sampledRows.length} sample posts to:`);
  console.log(`   👉 ${outputCsvPath}`);
  console.log("\n📝 Labeling Guidelines:");
  console.log("   Valid Roles:  ", ROLES.join(", "));
  console.log("   Valid Cities: ", CITIES.join(", "));
  console.log("\nOpen the CSV, fill in 'human_role' and 'human_city', then run:");
  console.log("   pnpm eval:score");
}

if (process.argv[1] && process.argv[1].endsWith("eval-sample.ts")) {
  generateEvalSample()
    .then(async () => {
      await client.end();
    })
    .catch(async (err) => {
      console.error("Failed to generate eval sample:", err);
      await client.end();
      process.exit(1);
    });
}
