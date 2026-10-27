import { parseCompilerFailure } from "./failure-analyzer"
import type { PipelineSnapshot } from "../gitlab/pipeline-client"
import type { FailureEvidence } from "../orbit/orbit-types"

export class EvidenceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EvidenceError"
  }
}

export function collectEvidence(pipeline: PipelineSnapshot): FailureEvidence {
  if (pipeline.status !== "failed" || !pipeline.failedJob) {
    throw new EvidenceError(`Pipeline #${pipeline.pipelineId} has no failed job to investigate.`)
  }
  const parsed = parseCompilerFailure(pipeline.failedJob.log)
  if (!parsed) {
    throw new EvidenceError("The failed job log does not contain a supported TypeScript contract error.")
  }
  return {
    projectPath: pipeline.projectPath,
    pipelineId: pipeline.pipelineId,
    jobId: pipeline.failedJob.id,
    jobName: pipeline.failedJob.name,
    stage: pipeline.failedJob.stage,
    filePath: parsed.filePath,
    line: parsed.line,
    typeName: parsed.typeName,
    missingProperty: parsed.missingProperty,
    suggestedProperty: parsed.suggestedProperty,
    message: parsed.message,
    logExcerpt: parsed.message,
  }
}
