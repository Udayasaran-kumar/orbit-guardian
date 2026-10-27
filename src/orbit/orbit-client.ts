import { gitlabRequest, type GitlabConfig } from "../gitlab/gitlab-client"
import type { FailureContextQuery, OrbitClient, OrbitFailureContext, OrbitWorkItem } from "./orbit-types"

type OrbitEntity = {
  found?: boolean
  type?: string | null
  error?: { code?: string }
  summary?: Record<string, unknown>
}

export class OrbitResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "OrbitResponseError"
  }
}

export class GitlabOrbitClient implements OrbitClient {
  readonly mode = "live" as const

  constructor(private readonly config: GitlabConfig) {}

  async investigateFailure(query: FailureContextQuery): Promise<OrbitFailureContext> {
    const token = query.jobWebUrl ?? `Job[${query.jobId}]`
    const jobBody = await this.context(token)
    const job = firstEntity(jobBody)
    if (!job?.found || !job.summary) {
      const code = job?.error?.code ?? "not_found"
      throw new OrbitResponseError(
        `Orbit context did not find ${token} (${code}). Mock context was not substituted.`,
      )
    }

    const mergeRequestToken = readToken(job.summary.merge_request)
    const mergeRequestBody = mergeRequestToken ? await this.context(mergeRequestToken) : null
    const mergeRequestEntity = mergeRequestBody ? firstEntity(mergeRequestBody) : null
    const mergeRequest = mergeRequestEntity?.found ? normalizeMergeRequest(mergeRequestEntity.summary) : null
    const workItems = mergeRequestEntity?.found ? normalizeWorkItems(mergeRequestEntity.summary) : []

    return {
      mode: "live",
      project: {
        path: readString(job.summary.project_path) ?? query.projectPath,
        name: (readString(job.summary.project_path) ?? query.projectPath).split("/").at(-1) ?? query.projectPath,
        description: "Project path returned by the Orbit job context summary.",
      },
      code: {
        files: (mergeRequest?.changedFiles ?? []).map((path) => ({
          path,
          summary: "Changed file listed on the Orbit merge request summary.",
        })),
      },
      mergeRequest,
      workItems,
      pipeline: {
        id: readNumber(asRecord(job.summary.pipeline)?.id) ?? query.pipelineId,
        status: readString(asRecord(job.summary.pipeline)?.status) ?? "failed",
        failedJob: readString(job.summary.name),
      },
      ownership: mergeRequest
        ? { source: "merge-request-author", name: mergeRequest.author }
        : null,
      securityFindings: [],
    }
  }

  private context(token: string): Promise<unknown> {
    return gitlabRequest<unknown>(this.config, "/api/v4/orbit/context", {
      method: "POST",
      body: JSON.stringify({
        tokens: [token],
        expand: true,
        response_format: "raw",
      }),
    })
  }
}

export function firstEntity(body: unknown): OrbitEntity | null {
  if (!isRecord(body) || !Array.isArray(body.entities)) return null
  const entity = body.entities[0]
  if (!isRecord(entity)) return null
  return {
    found: entity.found === true,
    type: typeof entity.type === "string" || entity.type === null ? entity.type : null,
    error: isRecord(entity.error) && typeof entity.error.code === "string" ? { code: entity.error.code } : undefined,
    summary: isRecord(entity.summary) ? entity.summary : undefined,
  }
}

export function normalizeMergeRequest(summary: Record<string, unknown> | undefined): OrbitFailureContext["mergeRequest"] {
  if (!summary) return null
  const iid = readNumber(summary.iid)
  const title = readString(summary.title)
  if (iid === null || !title) return null
  const authorRecord = asRecord(summary.author)
  return {
    iid,
    title,
    description: readString(summary.description) ?? "",
    author: readString(authorRecord?.name) ?? readString(authorRecord?.username) ?? "Unknown author",
    changedFiles: readPaths(summary.changed_files),
  }
}

export function normalizeWorkItems(summary: Record<string, unknown> | undefined): OrbitWorkItem[] {
  const linked = summary?.linked_issues
  if (!Array.isArray(linked)) return []
  const mergeIid = readNumber(summary?.iid)
  return linked.flatMap((item) => {
    if (!isRecord(item)) return []
    const iid = readNumber(item.iid)
    const title = readString(item.title)
    if (iid === null || !title) return []
    return [
      {
        iid,
        title,
        description: readString(item.description) ?? title,
        relatedMergeRequestIids: mergeIid === null ? [] : [mergeIid],
      },
    ]
  })
}

function readToken(value: unknown): string | null {
  const record = asRecord(value)
  return readString(record?.token)
}

function readPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === "string") return [item]
    if (isRecord(item) && typeof item.path === "string") return [item.path]
    return []
  })
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
