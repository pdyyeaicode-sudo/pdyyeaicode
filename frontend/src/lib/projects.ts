import type { AccessTokenProvider } from "./supabase";
import { createSupabaseClient } from "./supabase";
import type { DesignOutput } from "../types";

export interface DashboardProject {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  updatedAt: string;
  createdAt: string;
}

interface ProjectRow {
  id: string;
  name: string;
  thumbnail_url: string | null;
  updated_at: string;
  created_at: string;
}

interface ProjectDetailRow extends ProjectRow {
  document: unknown;
}

export class ProjectServiceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ProjectServiceError";
  }
}

export interface ProjectDetail extends DashboardProject {
  document: DesignOutput;
}

function isDesignOutput(value: unknown): value is DesignOutput {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<DesignOutput>;
  return (
    typeof candidate.requestId === "string" &&
    typeof candidate.composedSVG === "string" &&
    Array.isArray(candidate.svgLayers) &&
    typeof candidate.printMeta === "object" &&
    candidate.printMeta !== null
  );
}

function toDashboardProject(project: ProjectRow): DashboardProject {
  return {
    id: project.id,
    name: project.name,
    thumbnailUrl: project.thumbnail_url,
    updatedAt: project.updated_at,
    createdAt: project.created_at,
  };
}

/** Returns the active user's projects, ordered by their latest edit. */
export async function listProjects(
  ownerId: string,
  accessToken: AccessTokenProvider,
): Promise<DashboardProject[]> {
  try {
    const client = createSupabaseClient(accessToken);
    const { data, error } = await client
      .from("projects")
      .select("id, name, thumbnail_url, updated_at, created_at")
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Unable to load dashboard projects", error);
      throw new ProjectServiceError("Your projects could not be loaded. Please try again.");
    }

    return (data as ProjectRow[]).map(toDashboardProject);
  } catch (error: unknown) {
    if (error instanceof ProjectServiceError) {
      throw error;
    }

    console.error("Unexpected dashboard project loading error", error);
    throw new ProjectServiceError("Your projects could not be loaded. Please try again.");
  }
}

/** Loads a single project after its RLS policy has verified the active Clerk user. */
export async function getProject(
  projectId: string,
  accessToken: AccessTokenProvider,
): Promise<ProjectDetail> {
  try {
    const client = createSupabaseClient(accessToken);
    const { data, error } = await client
      .from("projects")
      .select("id, name, thumbnail_url, document, updated_at, created_at")
      .eq("id", projectId)
      .single();

    if (error || !data) {
      console.error("Unable to load editor project", error);
      throw new ProjectServiceError("This project could not be opened.");
    }

    const project = data as ProjectDetailRow;
    if (!isDesignOutput(project.document)) {
      throw new ProjectServiceError("This project has an invalid design document.");
    }

    return { ...toDashboardProject(project), document: project.document };
  } catch (error: unknown) {
    if (error instanceof ProjectServiceError) {
      throw error;
    }

    console.error("Unexpected editor project loading error", error);
    throw new ProjectServiceError("This project could not be opened.");
  }
}

/** Creates a Clerk-owned project with its initial editable SVG document. */
export async function createProject(
  ownerId: string,
  name: string,
  document: DesignOutput,
  accessToken: AccessTokenProvider,
): Promise<ProjectDetail> {
  try {
    const client = createSupabaseClient(accessToken);
    const { data, error } = await client
      .from("projects")
      .insert({ owner_id: ownerId, name, document })
      .select("id, name, thumbnail_url, document, updated_at, created_at")
      .single();

    if (error || !data) {
      console.error("Unable to create editor project", error);
      throw new ProjectServiceError("Your new project could not be created.");
    }

    const project = data as ProjectDetailRow;
    if (!isDesignOutput(project.document)) {
      throw new ProjectServiceError("The new project returned an invalid design document.");
    }

    return { ...toDashboardProject(project), document: project.document };
  } catch (error: unknown) {
    if (error instanceof ProjectServiceError) {
      throw error;
    }

    console.error("Unexpected editor project creation error", error);
    throw new ProjectServiceError("Your new project could not be created.");
  }
}

/** Persists the newest editable SVG representation for an existing project. */
export async function saveProjectDocument(
  projectId: string,
  name: string,
  document: DesignOutput,
  accessToken: AccessTokenProvider,
): Promise<void> {
  try {
    const client = createSupabaseClient(accessToken);
    const { error } = await client
      .from("projects")
      .update({ name, document })
      .eq("id", projectId);

    if (error) {
      console.error("Unable to save editor project", error);
      throw new ProjectServiceError("Your changes could not be saved.");
    }
  } catch (error: unknown) {
    if (error instanceof ProjectServiceError) {
      throw error;
    }

    console.error("Unexpected editor project save error", error);
    throw new ProjectServiceError("Your changes could not be saved.");
  }
}
