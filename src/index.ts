import "dotenv/config";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";
import { callLLM, generateImage, generateVideo } from "./minimax";

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

function readJSON(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// Step 1: Collect input
export function step1(outDir: string, description: string): void {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "input.txt"), description);
  console.log("Step 1: Input collected");
  console.log(`  Description: ${description}`);
}

// Step 2: Generate script
export async function step2(outDir: string): Promise<void> {
  const description = fs.readFileSync(path.join(outDir, "input.txt"), "utf-8");

  const prompt = `You are a movie director. Create a plan-séquence (one-shot, single continuous long take) based on this idea:

"${description}"

Split the long take into 3 to 6 segments of 6 seconds each. Describe every detail.
For N segments, provide N+1 keyframe descriptions: one for the opening, one for each transition between segments, and one for the ending.

Return ONLY a valid JSON object matching this JSON schema:
{
  "type": "object",
  "required": ["mainCharacterDescription", "keyframes", "segments"],
  "properties": {
    "mainCharacterDescription": { "type": "string", "description": "Detailed physical description of the main character for an AI model to generate. It will be used as reference image for generating subsequent images. Make sure the character is shown full-body (not a close-up)" },
    "keyframes": {
      "type": "array",
      "description": "N+1 vivid visual descriptions of keyframe images. keyframes[0] is the opening, keyframes[N] is the ending, and keyframes[i] for 0 < i < N are the transition points between segments.",
      "items": { "type": "string" }
    },
    "segments": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["script"],
        "properties": {
          "script": { "type": "string", "description": "What happens in this segment of the long take" }
        }
      }
    }
  }
}
`;

  console.log("Step 2: Generating script...");
  const raw = await callLLM(prompt);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Failed to parse script from response");
  let jsonStr = raw.slice(start, end + 1);
  // Clean trailing commas before ] or }
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
  // Fix unescaped control characters inside JSON string values
  jsonStr = jsonStr.replace(/(?<=: *")((?:[^"\\]|\\.)*)(?=")/g, (match) =>
    match.replace(/[\n\r\t]/g, (c) => c === "\n" ? "\\n" : c === "\r" ? "\\r" : "\\t")
  );
  let script: any;
  try {
    script = JSON.parse(jsonStr);
  } catch {
    // Last resort: strip all control chars inside strings
    jsonStr = jsonStr.replace(/[\x00-\x1f]/g, " ");
    script = JSON.parse(jsonStr);
  }

  if (!Array.isArray(script.segments) || !Array.isArray(script.keyframes) || !script.mainCharacterDescription) {
    throw new Error(`Invalid script: missing segments, keyframes, or mainCharacterDescription. Re-run step 2.`);
  }
  const expected = script.segments.length + 1;
  if (script.keyframes.length !== expected) {
    throw new Error(`Expected ${expected} keyframes for ${script.segments.length} segments, got ${script.keyframes.length}. Re-run step 2.`);
  }

  fs.writeFileSync(path.join(outDir, "script.json"), JSON.stringify(script, null, 2));
  console.log(`  Character: ${script.mainCharacterDescription}`);
  console.log(`  Keyframes: ${script.keyframes.length}`);
  script.keyframes.forEach((kf: string, i: number) => {
    console.log(`    [${i}] ${kf}`);
  });
  script.segments.forEach((s: any, i: number) => {
    console.log(`  Segment ${i + 1}: ${s.script}`);
  });
}

// Step 3: Generate character reference image
export async function step3(outDir: string): Promise<void> {
  const script = readJSON(path.join(outDir, "script.json"));

  console.log("Step 3: Generating character reference image...");
  const characterImageUrl = await generateImage(script.mainCharacterDescription);
  await downloadFile(characterImageUrl, path.join(outDir, "character.jpg"));
  fs.writeFileSync(path.join(outDir, "character_url.txt"), characterImageUrl);
  console.log(`  Saved: character.jpg`);
}

// Step 4: Generate keyframe images
export async function step4(outDir: string): Promise<void> {
  const script = readJSON(path.join(outDir, "script.json"));
  const characterImageUrl = fs.readFileSync(path.join(outDir, "character_url.txt"), "utf-8");

  if (!script.keyframes) {
    throw new Error("Script is missing keyframes. Re-run step 2 to generate a new script.");
  }

  console.log("Step 4: Generating keyframe images...");
  const limit = pLimit(5);
  const keyframeUrls = await Promise.all(
    script.keyframes.map((description: string, i: number) =>
      limit(async () => {
        console.log(`  Keyframe ${i}...`);
        const url = await generateImage(description, characterImageUrl);
        await downloadFile(url, path.join(outDir, `keyframe${i}.jpg`));
        console.log(`  Keyframe ${i} done`);
        return url;
      })
    )
  );

  fs.writeFileSync(path.join(outDir, "keyframes.json"), JSON.stringify(keyframeUrls, null, 2));
}

// Step 5: Generate video segments
export async function step5(outDir: string): Promise<void> {
  const script = readJSON(path.join(outDir, "script.json"));
  const keyframeUrls: string[] = readJSON(path.join(outDir, "keyframes.json"));

  console.log("Step 5: Generating video segments...");
  const limit = pLimit(5);
  await Promise.all(
    script.segments.map((segment: any, i: number) =>
      limit(async () => {
        console.log(`  Segment ${i + 1}...`);
        const videoUrl = await generateVideo(
          segment.script,
          keyframeUrls[i],
          keyframeUrls[i + 1]
        );
        const videoPath = path.join(outDir, `segment${i + 1}.mp4`);
        await downloadFile(videoUrl, videoPath);
        console.log(`  Segment ${i + 1} done: ${videoPath}`);
      })
    )
  );
}

// Step 6: Stitch segments
export function step6(outDir: string): void {
  const script = readJSON(path.join(outDir, "script.json"));
  const count = script.segments.length;

  console.log("Step 6: Stitching segments...");
  const listPath = path.join(outDir, "list.txt");
  const listContent = Array.from({ length: count }, (_, i) => `file 'segment${i + 1}.mp4'`).join("\n");
  fs.writeFileSync(listPath, listContent);
  const outputPath = path.join(outDir, "movie.mp4");
  execSync(`ffmpeg -f concat -safe 0 -i ${listPath} -c copy ${outputPath}`);
  console.log(`  Done: ${outputPath}`);
}

// Run all steps
export async function createMovie(description: string): Promise<void> {
  const outDir = path.join("temp", String(Date.now()));
  console.log(`Output: ${outDir}\n`);
  step1(outDir, description);
  await step2(outDir);
  await step3(outDir);
  await step4(outDir);
  await step5(outDir);
  step6(outDir);
}
