import type { FailureEvidence, OrbitFailureContext } from "../orbit/orbit-types"

export type Correlation = {
  fileInContext: boolean
  mergeRequest: OrbitFailureContext["mergeRequest"]
  mergeRequestTouchedFile: boolean
  workItem: OrbitFailureContext["workItems"][number] | null
  contextMentionsReplacement: boolean
  ownership: OrbitFailureContext["ownership"]
}

export function correlate(evidence: FailureEvidence, context: OrbitFailureContext): Correlation {
  const mergeRequestTouchedFile = context.mergeRequest?.changedFiles.includes(evidence.filePath) ?? false
  const workItem =
    context.workItems.find((item) =>
      context.mergeRequest ? item.relatedMergeRequestIids.includes(context.mergeRequest.iid) : false,
    ) ?? null
  const corpus = [
    context.mergeRequest?.description ?? "",
    context.mergeRequest?.title ?? "",
    workItem?.description ?? "",
    workItem?.title ?? "",
  ]
    .join("\n")
    .toLowerCase()

  return {
    fileInContext:
      context.code.files.some((file) => file.path === evidence.filePath) || mergeRequestTouchedFile,
    mergeRequest: context.mergeRequest,
    mergeRequestTouchedFile,
    workItem,
    contextMentionsReplacement: corpus.includes(evidence.suggestedProperty.toLowerCase()),
    ownership: context.ownership,
  }
}
