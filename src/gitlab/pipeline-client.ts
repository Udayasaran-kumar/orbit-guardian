import { gitlabRequest, type GitlabConfig } from "./gitlab-client"
import {
  DEMO_JOB_ID,
  DEMO_PIPELINE_ID,
  DEMO_PROJECT_NAME,
  DEMO_PROJECT_PATH,
  PIPELINE_LOG,
} from "../fixtures/scenario"

export type PipelineSnapshot = {
  projectPath: string
  projectName: string
  pipelineId: number
  status: "failed" | "success" | "running" | "canceled" | "pending"
  ref: string
  sha: string
  webUrl: string | null
  failedJob: {
    id: number
    name: string
    stage: string
    webUrl: string | null
    log: string
  } | null
}

export interface PipelineClient {
  readonly mode: "mock" | "live"
  getFailedPipeline(pipelineId?: number): Promise<PipelineSnapshot>
}

export class MockPipelineClient implements PipelineClient {
  readonly mode = "mock" as const

  async getFailedPipeline(pipelineId = DEMO_PIPELINE_ID): Promise<PipelineSnapshot> {
    if (pipelineId !== DEMO_PIPELINE_ID) {
      throw new Error(`Mock pipeline client only has pipeline #${DEMO_PIPELINE_ID}.`)
    }
    return {
      projectPath: DEMO_PROJECT_PATH,
      projectName: DEMO_PROJECT_NAME,
      pipelineId: DEMO_PIPELINE_ID,
      status: "failed",
      ref: "main",
      sha: "demo184",
      webUrl: null,
      failedJob: {
        id: DEMO_JOB_ID,
        name: "typecheck",
        stage: "test",
        webUrl: null,
        log: PIPELINE_LOG,
      },
    }
  }
}

type GitlabPipeline = {
  id: number
  status: PipelineSnapshot["status"]
  ref: string
  sha: string
  web_url?: string
}

type GitlabJob = {
  id: number
  name: string
  stage: string
  status: string
  web_url?: string
}

export class GitlabPipelineClient implements PipelineClient {
  readonly mode = "live" as const

  constructor(private readonly config: GitlabConfig) {}

  async getFailedPipeline(pipelineId?: number): Promise<PipelineSnapshot> {
    const project = encodeURIComponent(this.config.projectId)
    const pipeline = pipelineId
      ? await gitlabRequest<GitlabPipeline>(this.config, `/api/v4/projects/${project}/pipelines/${pipelineId}`)
      : await this.latestFailedPipeline(project)
    const jobs = await gitlabRequest<GitlabJob[]>(
      this.config,
      `/api/v4/projects/${project}/pipelines/${pipeline.id}/jobs`,
    )
    const failed = jobs.find((job) => job.status === "failed") ?? null
    const log = failed
      ? await gitlabRequest<string>(this.config, `/api/v4/projects/${project}/jobs/${failed.id}/trace`)
      : ""
    return {
      projectPath: this.config.projectId,
      projectName: this.config.projectId,
      pipelineId: pipeline.id,
      status: pipeline.status,
      ref: pipeline.ref,
      sha: pipeline.sha,
      webUrl: pipeline.web_url ?? null,
      failedJob: failed
        ? {
            id: failed.id,
            name: failed.name,
            stage: failed.stage,
            webUrl: failed.web_url ?? null,
            log,
          }
        : null,
    }
  }

  private async latestFailedPipeline(project: string): Promise<GitlabPipeline> {
    const pipelines = await gitlabRequest<GitlabPipeline[]>(
      this.config,
      `/api/v4/projects/${project}/pipelines?status=failed&per_page=1`,
    )
    const pipeline = pipelines[0]
    if (!pipeline) throw new Error("GitLab returned no failed pipelines for this project.")
    return pipeline
  }
}
