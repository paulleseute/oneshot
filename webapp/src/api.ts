export interface Project {
  id: string;
  completedStep: number;
  description: string;
  runningStep: number | null;
}

export interface ProjectStatus {
  id: string;
  completedStep: number;
  artifacts: string[];
  runningStep: number | null;
}

export interface Script {
  mainCharacterDescription: string;
  keyframes: string[];
  segments: { script: string }[];
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects");
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function createProject(description: string): Promise<{ id: string }> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error("Failed to create project");
  return res.json();
}

export async function fetchStatus(id: string): Promise<ProjectStatus> {
  const res = await fetch(`/api/projects/${id}/status`);
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
}

export async function runStep(id: string, stepNum: number, body?: object): Promise<ProjectStatus> {
  const res = await fetch(`/api/projects/${id}/step/${stepNum}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error);
  }
  return res.json();
}

export async function fetchScript(id: string): Promise<Script> {
  const res = await fetch(`/api/projects/${id}/script`);
  if (!res.ok) throw new Error("Script not found");
  return res.json();
}
