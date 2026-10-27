export type GitlabConfig = {
  baseUrl: string
  token: string
  projectId: string
}

export function readGitlabConfig(env: NodeJS.ProcessEnv): GitlabConfig | null {
  const baseUrl = env.GITLAB_URL?.trim().replace(/\/$/, "")
  const token = env.GITLAB_TOKEN?.trim()
  const projectId = env.GITLAB_PROJECT_ID?.trim()
  if (!baseUrl || !token || !projectId) return null
  return { baseUrl, token, projectId }
}

export class GitlabRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "GitlabRequestError"
    this.status = status
  }
}

export async function gitlabRequest<T>(config: GitlabConfig, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set("PRIVATE-TOKEN", config.token)
  headers.set("Accept", "application/json")
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json")

  const response = await fetch(`${config.baseUrl}${path}`, { ...init, headers })
  if (!response.ok) {
    const body = await response.text()
    throw new GitlabRequestError(`GitLab ${response.status} for ${path}: ${body.slice(0, 300)}`, response.status)
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  if (!text) return undefined as T
  if ((response.headers.get("content-type") ?? "").includes("application/json")) {
    return JSON.parse(text) as T
  }
  return text as T
}
