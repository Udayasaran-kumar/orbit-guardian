export type FailureEvidence = {
  projectPath: string
  pipelineId: number
  jobId: number
  jobName: string
  stage: string
  filePath: string
  line: number
  typeName: string
  missingProperty: string
  suggestedProperty: string
  message: string
  logExcerpt: string
}

export type OrbitCodeFile = {
  path: string
  summary: string
}

export type OrbitMergeRequest = {
  iid: number
  title: string
  description: string
  author: string
  changedFiles: string[]
}

export type OrbitWorkItem = {
  iid: number
  title: string
  description: string
  relatedMergeRequestIids: number[]
}

export type OrbitFailureContext = {
  mode: "mock" | "live"
  project: {
    path: string
    name: string
    description: string
  }
  code: {
    files: OrbitCodeFile[]
  }
  mergeRequest: OrbitMergeRequest | null
  workItems: OrbitWorkItem[]
  pipeline: {
    id: number
    status: string
    failedJob: string | null
  }
  ownership: {
    source: "merge-request-author" | "work-item-assignee"
    name: string
  } | null
  securityFindings: Array<{
    id: string
    title: string
    severity: string
  }>
}

export type FailureContextQuery = {
  projectPath: string
  pipelineId: number
  jobId: number
  jobWebUrl: string | null
  filePath: string | null
}

export interface OrbitClient {
  readonly mode: "mock" | "live"
  investigateFailure(query: FailureContextQuery): Promise<OrbitFailureContext>
}
