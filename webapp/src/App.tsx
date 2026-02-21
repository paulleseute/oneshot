import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchProjects,
  createProject,
  fetchStatus,
  runStep,
  fetchScript,
  type Project,
  type ProjectStatus,
  type Script,
} from "./api";

const STEPS: { label: string; description: string }[] = [
  { label: "Input", description: "Collect movie description" },
  { label: "Script", description: "Generate script, keyframes & segments" },
  { label: "Character", description: "Generate character reference image" },
  { label: "Keyframes", description: "Generate keyframe images" },
  { label: "Video", description: "Generate video segments" },
  { label: "Stitch", description: "Concatenate into final movie" },
];

function StepCard({
  stepNum,
  label,
  description,
  state,
  onRun,
  disabled,
  children,
}: {
  stepNum: number;
  label: string;
  description: string;
  state: "pending" | "running" | "done";
  onRun: () => void;
  disabled: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`card card--${state}`}>
      <div className="card-header">
        <div className="card-badge">
          {state === "running" ? (
            <span className="spinner" />
          ) : state === "done" ? (
            <span className="check">{"\u2713"}</span>
          ) : (
            <span className="card-num">{stepNum}</span>
          )}
        </div>
        <div className="card-title">
          <h3>{label}</h3>
          <p>{description}</p>
        </div>
        {state !== "running" && (
          <button
            className="card-run"
            onClick={onRun}
            disabled={disabled}
          >
            {state === "done" ? "Re-run" : "Run"}
          </button>
        )}
      </div>

      {state === "running" && (
        <div className="card-loading">
          <div className="loading-bar" />
          <span>Processing...</span>
        </div>
      )}

      {children && <div className="card-body">{children}</div>}
    </div>
  );
}

function ProjectView({
  project,
  auto,
  onUpdate,
}: {
  project: Project;
  auto: boolean;
  onUpdate: () => void;
}) {
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const s = await fetchStatus(project.id);
    setStatus(s);
    if (s.completedStep >= 2) {
      try {
        setScript(await fetchScript(project.id));
      } catch {}
    }
  }, [project.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status?.runningStep) return;
    const iv = setInterval(refresh, 2000);
    return () => clearInterval(iv);
  }, [status?.runningStep, refresh]);

  const runningRef = useRef(false);

  const handleRun = async (stepNum: number) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setError(null);
    setStatus((prev) => prev ? { ...prev, runningStep: stepNum } : prev);
    try {
      const s = await runStep(project.id, stepNum);
      setStatus(s);
      onUpdate();
      // Auto-advance to next step
      const LAST_STEP = 6;
      const next = s.completedStep + 1;
      if (auto && next >= 2 && next <= LAST_STEP) {
        runningRef.current = false;
        handleRun(next);
        return;
      }
    } catch (e: any) {
      setError(e.message);
      refresh();
    } finally {
      runningRef.current = false;
    }
  };

  const completedStep = status?.completedStep ?? project.completedStep;
  const runningStep = status?.runningStep ?? project.runningStep;
  const artifacts = status?.artifacts ?? [];

  const keyframeImages = artifacts
    .filter((f) => f.match(/^keyframe\d+\.jpg$/))
    .sort();
  const segmentVideos = artifacts
    .filter((f) => f.match(/^segment\d+\.mp4$/))
    .sort();
  const hasMovie = artifacts.some(
    (f) => f === "movie.mp4" || f === "output.mp4"
  );
  const movieFile = artifacts.includes("movie.mp4")
    ? "movie.mp4"
    : "output.mp4";

  const stepState = (num: number): "pending" | "running" | "done" =>
    runningStep === num ? "running" : completedStep >= num ? "done" : "pending";

  const anyRunning = runningStep !== null;

  return (
    <div className="project">
      <div className="project-header">
        <p className="description">{project.description}</p>
        <span className="project-id">#{project.id}</span>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="cards">
        <StepCard
          stepNum={1}
          label={STEPS[1].label}
          description={STEPS[1].description}
          state={stepState(2)}
          onRun={() => handleRun(2)}
          disabled={anyRunning}
        >
          {script && (
            <div className="script-content">
              <p><strong>Character:</strong> {script.mainCharacterDescription}</p>
              <div className="script-segments">
                {script.segments.map((seg, i) => (
                  <div key={i} className="segment-script">
                    <span className="seg-num">Segment {i + 1}</span>
                    {seg.script}
                  </div>
                ))}
              </div>
            </div>
          )}
        </StepCard>

        <StepCard
          stepNum={2}
          label={STEPS[2].label}
          description={STEPS[2].description}
          state={stepState(3)}
          onRun={() => handleRun(3)}
          disabled={anyRunning}
        >
          {artifacts.includes("character.jpg") && (
            <img
              className="card-image"
              src={`/media/${project.id}/character.jpg`}
              alt="Character reference"
            />
          )}
        </StepCard>

        <StepCard
          stepNum={3}
          label={STEPS[3].label}
          description={STEPS[3].description}
          state={stepState(4)}
          onRun={() => handleRun(4)}
          disabled={anyRunning}
        >
          {keyframeImages.length > 0 && (
            <div className="image-row">
              {keyframeImages.map((f) => (
                <img key={f} src={`/media/${project.id}/${f}`} alt={f} />
              ))}
            </div>
          )}
        </StepCard>

        <StepCard
          stepNum={4}
          label={STEPS[4].label}
          description={STEPS[4].description}
          state={stepState(5)}
          onRun={() => handleRun(5)}
          disabled={anyRunning}
        >
          {segmentVideos.length > 0 && (
            <div className="video-row">
              {segmentVideos.map((f) => (
                <video key={f} src={`/media/${project.id}/${f}`} controls />
              ))}
            </div>
          )}
        </StepCard>

        <StepCard
          stepNum={5}
          label={STEPS[5].label}
          description={STEPS[5].description}
          state={stepState(6)}
          onRun={() => handleRun(6)}
          disabled={anyRunning}
        >
          {hasMovie && (
            <video
              className="card-video-full"
              src={`/media/${project.id}/${movieFile}`}
              controls
            />
          )}
        </StepCard>
      </div>
    </div>
  );
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);

  const loadProjects = useCallback(async () => {
    try {
      setProjects(await fetchProjects());
    } catch {}
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreate = async () => {
    if (!input.trim()) return;
    setCreating(true);
    try {
      const { id } = await createProject(input.trim());
      setInput("");
      await loadProjects();
      setSelected(id);
      runStep(id, 2).then(() => loadProjects());
    } catch {}
    setCreating(false);
  };

  const selectedProject = projects.find((p) => p.id === selected);

  return (
    <div className="app">
      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1>OneShot</h1>
            <p className="subtitle">AI-generated plan-sequence movies</p>
          </div>
          <div className="sidebar-list">
            {projects.map((p) => (
              <button
                key={p.id}
                className={`project-item ${p.id === selected ? "selected" : ""}`}
                onClick={() => setSelected(p.id)}
              >
                <span className="project-desc">
                  {p.description.slice(0, 60) || "Untitled"}
                </span>
                <span className="project-progress">
                  Step {p.completedStep}/6
                  {p.runningStep !== null && " \u25B6"}
                </span>
              </button>
            ))}
            {projects.length === 0 && (
              <p className="empty">No projects yet</p>
            )}
          </div>
        </aside>

        <main>
          <div className="main-header">
            <input
              type="text"
              placeholder="Describe your movie..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              disabled={creating}
            />
            <button onClick={handleCreate} disabled={creating || !input.trim()}>
              {creating ? "Creating..." : "Create"}
            </button>
            <label className="switch-toggle">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              <span className="switch-track"><span className="switch-thumb" /></span>
              Auto
            </label>
          </div>
          {selectedProject ? (
            <ProjectView
              key={selectedProject.id}
              project={selectedProject}
              auto={auto}
              onUpdate={loadProjects}
            />
          ) : (
            <div className="placeholder">
              Select a project or create a new one
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
