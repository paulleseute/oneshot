import "dotenv/config";
import tracer from "dd-trace";
tracer.init({
  service: "oneshot",
  ...(process.env.DD_API_KEY && {
    url: `https://trace.agent.${process.env.DD_SITE || "datadoghq.com"}`,
  }),
});
import express from "express";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import { step1, step2, step3, step4, step5, step6 } from "./index";

const app = express();
app.use(cors());
app.use(express.json());

const TEMP_DIR = path.resolve("temp");

// --- Helpers ---

function getProjectDir(id: string): string {
  return path.join(TEMP_DIR, id);
}

function detectStatus(dir: string): { completedStep: number; artifacts: string[] } {
  if (!fs.existsSync(dir)) return { completedStep: 0, artifacts: [] };

  const files = fs.readdirSync(dir);
  const artifacts = files.filter(
    (f) => f.endsWith(".jpg") || f.endsWith(".mp4") || f.endsWith(".json") || f === "input.txt"
  );

  let completedStep = 0;
  if (files.includes("input.txt")) completedStep = 1;
  if (files.includes("script.json")) completedStep = 2;
  if (files.includes("character.jpg")) completedStep = 3;
  if (files.some((f) => f.match(/^keyframe\d+\.jpg$/))) completedStep = 4;
  if (files.some((f) => f.match(/^segment\d+\.mp4$/))) completedStep = 5;
  if (files.includes("movie.mp4") || files.includes("output.mp4")) completedStep = 6;

  return { completedStep, artifacts };
}

// Track running steps so we can report "running" state
const running = new Map<string, number>(); // projectId -> stepNum

// --- Routes ---

// List all projects
app.get("/api/projects", (_req, res) => {
  if (!fs.existsSync(TEMP_DIR)) {
    res.json([]);
    return;
  }
  const dirs = fs.readdirSync(TEMP_DIR).filter((d) => {
    return fs.statSync(path.join(TEMP_DIR, d)).isDirectory();
  });

  const projects = dirs
    .sort((a, b) => b.localeCompare(a))
    .map((id) => {
      const dir = getProjectDir(id);
      const { completedStep } = detectStatus(dir);
      const inputPath = path.join(dir, "input.txt");
      const description = fs.existsSync(inputPath) ? fs.readFileSync(inputPath, "utf-8") : "";
      return { id, completedStep, description, runningStep: running.get(id) ?? null };
    });

  res.json(projects);
});

// Create project (runs step 1)
app.post("/api/projects", (req, res) => {
  const { description } = req.body;
  if (!description) {
    res.status(400).json({ error: "description required" });
    return;
  }

  const id = String(Date.now());
  const dir = getProjectDir(id);
  step1(dir, description);

  res.json({ id, completedStep: 1 });
});

// Get project status
app.get("/api/projects/:id/status", (req, res) => {
  const dir = getProjectDir(req.params.id);
  const { completedStep, artifacts } = detectStatus(dir);
  res.json({
    id: req.params.id,
    completedStep,
    artifacts,
    runningStep: running.get(req.params.id) ?? null,
  });
});

// Run a step
app.post("/api/projects/:id/step/:stepNum", async (req, res) => {
  const { id } = req.params;
  const stepNum = parseInt(req.params.stepNum);
  const dir = getProjectDir(id);

  if (stepNum < 1 || stepNum > 6) {
    res.status(400).json({ error: "stepNum must be 1-6" });
    return;
  }

  if (running.has(id)) {
    res.status(409).json({ error: `Step ${running.get(id)} is already running for this project` });
    return;
  }

  running.set(id, stepNum);
  try {
    switch (stepNum) {
      case 1: {
        const { description } = req.body;
        if (!description) {
          res.status(400).json({ error: "description required for step 1" });
          return;
        }
        step1(dir, description);
        break;
      }
      case 2:
        await step2(dir);
        break;
      case 3:
        await step3(dir);
        break;
      case 4:
        await step4(dir);
        break;
      case 5:
        await step5(dir);
        break;
      case 6:
        step6(dir);
        break;
    }
    const status = detectStatus(dir);
    res.json({ id, ...status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    running.delete(id);
  }
});

// Get script
app.get("/api/projects/:id/script", (req, res) => {
  const scriptPath = path.join(getProjectDir(req.params.id), "script.json");
  if (!fs.existsSync(scriptPath)) {
    res.status(404).json({ error: "Script not found" });
    return;
  }
  res.json(JSON.parse(fs.readFileSync(scriptPath, "utf-8")));
});

// Serve media files from temp/
app.use("/media", express.static(TEMP_DIR));

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Studio API running on http://localhost:${PORT}`);
});
