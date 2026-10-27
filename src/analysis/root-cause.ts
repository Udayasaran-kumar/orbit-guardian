import type { Correlation } from "../agent/investigator"
import type { FailureEvidence } from "../orbit/orbit-types"

export type RootCause = {
  summary: string
  confidence: "high" | "low"
  evidence: string[]
  proposedAction: string | null
  previousExpression: string | null
  replacementExpression: string | null
}

export function determineRootCause(evidence: FailureEvidence, correlation: Correlation): RootCause {
  const previousExpression = `user.profile.${evidence.missingProperty}`
  const replacementExpression = `user.profile.${evidence.suggestedProperty}`
  const shared = [
    `Pipeline #${evidence.pipelineId} failed during ${evidence.jobName}.`,
    evidence.message,
    correlation.mergeRequest
      ? `Merge request !${correlation.mergeRequest.iid} (“${correlation.mergeRequest.title}”) changed ${correlation.mergeRequest.changedFiles.join(", ")}.`
      : "Orbit context did not include a related merge request.",
    correlation.workItem
      ? `Work item #${correlation.workItem.iid} (“${correlation.workItem.title}”) is linked to that change.`
      : "Orbit context did not include a linked work item.",
  ]

  const supported =
    correlation.mergeRequestTouchedFile &&
    correlation.contextMentionsReplacement &&
    correlation.workItem !== null &&
    evidence.missingProperty !== evidence.suggestedProperty

  if (!supported) {
    return {
      summary: "The pipeline log is not enough, on its own, to choose a repair.",
      confidence: "low",
      evidence: shared,
      proposedAction: null,
      previousExpression: null,
      replacementExpression: null,
    }
  }

  return {
    summary: "The consumer still expects the previous profile response contract.",
    confidence: "high",
    evidence: [
      ...shared,
      `The compiler still reads ${previousExpression}, while the linked work item and merge request describe ${evidence.suggestedProperty}.`,
    ],
    proposedAction: `Update the affected consumer to use ${replacementExpression}.`,
    previousExpression,
    replacementExpression,
  }
}
