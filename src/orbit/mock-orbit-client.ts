import {
  DEMO_PIPELINE_ID,
  DEMO_PROJECT_NAME,
  DEMO_PROJECT_PATH,
  MERGE_REQUEST,
  WORK_ITEM,
} from "../fixtures/scenario"
import type { FailureContextQuery, OrbitClient, OrbitFailureContext } from "./orbit-types"

export class MockOrbitClient implements OrbitClient {
  readonly mode = "mock" as const

  async investigateFailure(query: FailureContextQuery): Promise<OrbitFailureContext> {
    if (query.projectPath !== DEMO_PROJECT_PATH || query.pipelineId !== DEMO_PIPELINE_ID) {
      return emptyContext(query)
    }

    return {
      mode: "mock",
      project: {
        path: DEMO_PROJECT_PATH,
        name: DEMO_PROJECT_NAME,
        description: "Demo project whose profile API response contract changed.",
      },
      code: {
        files: [
          {
            path: "src/types/profile.ts",
            summary: "Profile response type. The current contract exposes displayName.",
          },
          {
            path: "src/services/user-service.ts",
            summary: "Consumer that builds a greeting from the profile response.",
          },
        ],
      },
      mergeRequest: { ...MERGE_REQUEST },
      workItems: [{ ...WORK_ITEM }],
      pipeline: {
        id: DEMO_PIPELINE_ID,
        status: "failed",
        failedJob: "typecheck",
      },
      ownership: {
        source: "merge-request-author",
        name: MERGE_REQUEST.author,
      },
      securityFindings: [],
    }
  }
}

function emptyContext(query: FailureContextQuery): OrbitFailureContext {
  return {
    mode: "mock",
    project: {
      path: query.projectPath,
      name: query.projectPath.split("/").at(-1) ?? query.projectPath,
      description: "No indexed Orbit context was available for this pipeline.",
    },
    code: { files: [] },
    mergeRequest: null,
    workItems: [],
    pipeline: {
      id: query.pipelineId,
      status: "failed",
      failedJob: null,
    },
    ownership: null,
    securityFindings: [],
  }
}
