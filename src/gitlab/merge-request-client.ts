import { gitlabRequest, type GitlabConfig } from "./gitlab-client"

export type MergeRequestDraft = {
  sourceBranch: string
  targetBranch: string
  title: string
  description: string
}

export function assertCreateMergeRequestAllowed(flags: {
  createMr: boolean
  live: boolean
  sourceBranch?: string
}): void {
  if (!flags.createMr) {
    throw new Error("Refusing to create a merge request without --create-mr.")
  }
  if (!flags.live) {
    throw new Error("Refusing to create a merge request outside --live mode. No request was sent.")
  }
  if (!flags.sourceBranch) {
    throw new Error("Refusing to create a merge request without --source-branch. No branch was pushed.")
  }
}

export async function createMergeRequest(
  config: GitlabConfig,
  draft: MergeRequestDraft,
): Promise<{ iid: number; webUrl: string }> {
  const project = encodeURIComponent(config.projectId)
  const created = await gitlabRequest<{ iid: number; web_url: string }>(
    config,
    `/api/v4/projects/${project}/merge_requests`,
    {
      method: "POST",
      body: JSON.stringify({
        source_branch: draft.sourceBranch,
        target_branch: draft.targetBranch,
        title: draft.title,
        description: draft.description,
        remove_source_branch: false,
      }),
    },
  )
  return { iid: created.iid, webUrl: created.web_url }
}
