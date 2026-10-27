import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { correlate } from "./investigator"
import { WORKFLOW } from "./planner"
import { applyRepair, proposeRepair, type ProposedRepair } from "./repair"
import { collectEvidence } from "../analysis/evidence"
import { determineRootCause, type RootCause } from "../analysis/root-cause"
import { BROKEN_USER_SERVICE } from "../fixtures/scenario"
import { readGitlabConfig } from "../gitlab/gitlab-client"
import { assertCreateMergeRequestAllowed, createMergeRequest } from "../gitlab/merge-request-client"
import {
  GitlabPipelineClient,
  MockPipelineClient,
  type PipelineClient,
  type PipelineSnapshot,
} from "../gitlab/pipeline-client"
import { GitlabOrbitClient } from "../orbit/orbit-client"
import { MockOrbitClient } from "../orbit/mock-orbit-client"
import type { FailureEvidence, OrbitClient, OrbitFailureContext } from "../orbit/orbit-types"
import { renderInvestigationMarkdown, writeInvestigationReport, type InvestigationReportInput } from "../reports/report-generator"
import { validateProposal, type ValidationReport } from "../validation/test-runner"

export type GuardianOptions = {
  projectRoot: string
  apply?: boolean
  live?: boolean
  createMr?: boolean
  sourceBranch?: string
  pipelineId?: number
  pipelineClient?: PipelineClient
  orbitClient?: OrbitClient
  env?: NodeJS.ProcessEnv
}

export type InvestigationResult = {
  steps: string[]
  pipeline: PipelineSnapshot
  evidence: FailureEvidence
  context: OrbitFailureContext
  correlation: ReturnType<typeof correlate>
  rootCause: RootCause
  repair: ProposedRepair | null
  validation: ValidationReport | null
  applied: boolean
  reportPath: string
  markdown: string
  mergeRequestAction: string
}

export async function resetFixture(projectRoot: string): Promise<void> {
  const { writeFile } = await import("node:fs/promises")
  await writeFile(fixtureFile(projectRoot), BROKEN_USER_SERVICE)
}

export async function runInvestigation(options: GuardianOptions): Promise<InvestigationResult> {
  const apply = options.apply ?? false
  const live = options.live ?? false
  const steps: string[] = []
  const mark = (index: number) => {
    const label = WORKFLOW[index - 1]
    if (!label) throw new Error(`Missing workflow step ${index}`)
    steps.push(`[${index}/7] ${label}...`)
  }

  await resetFixture(options.projectRoot)

  mark(1)
  const pipelineClient = options.pipelineClient ?? (await selectPipelineClient(live, options.env ?? process.env))
  const pipeline = await pipelineClient.getFailedPipeline(options.pipelineId)

  mark(2)
  const evidence = collectEvidence(pipeline)

  mark(3)
  const orbitClient = options.orbitClient ?? (await selectOrbitClient(live, options.env ?? process.env))
  const context = await orbitClient.investigateFailure({
    projectPath: pipeline.projectPath,
    pipelineId: pipeline.pipelineId,
    jobId: evidence.jobId,
    jobWebUrl: pipeline.failedJob?.webUrl ?? null,
    filePath: evidence.filePath,
  })

  mark(4)
  const correlation = correlate(evidence, context)

  mark(5)
  const rootCause = determineRootCause(evidence, correlation)
  const source = await readFile(fixtureFile(options.projectRoot), "utf8")
  const repair = proposeRepair(source, evidence.filePath, rootCause)

  mark(6)
  const validation = repair
    ? await validateProposal(
        repair.repairedSource,
        fixtureDir(options.projectRoot),
        options.projectRoot,
        repair.replacementExpression,
        repair.previousExpression,
      )
    : null
  const appliedResult = repair ? await applyRepair(fixtureDir(options.projectRoot), repair, apply) : null

  mark(7)
  const mergeRequestAction = await mergeRequestDecision(options, rootCause.summary)
  const reportInput: InvestigationReportInput = {
    evidence,
    context,
    correlation,
    rootCause,
    repair,
    validation,
    applied: appliedResult?.applied ?? false,
    mergeRequestAction,
  }
  const markdown = renderInvestigationMarkdown(reportInput)
  const reportPath = join(options.projectRoot, "reports", "latest-investigation.md")
  await writeInvestigationReport(reportPath, markdown)

  return {
    steps,
    pipeline,
    evidence,
    context,
    correlation,
    rootCause,
    repair,
    validation,
    applied: appliedResult?.applied ?? false,
    reportPath,
    markdown,
    mergeRequestAction,
  }
}

export function renderCli(result: InvestigationResult): string {
  const repair = result.repair
  const lines = [
    "Orbit Guardian",
    "Context-aware pipeline failure investigation",
    "",
    `Pipeline: #${result.pipeline.pipelineId}`,
    `Status: ${result.pipeline.status.toUpperCase()}`,
    `Mode: ${result.context.mode === "mock" ? "mock Orbit (offline demo)" : "GitLab Orbit API"}`,
    "",
    ...result.steps,
    "",
    "✓ Failure evidence collected",
    "✓ Orbit context retrieved",
    result.correlation.mergeRequest
      ? `✓ Related MR identified: !${result.correlation.mergeRequest.iid}`
      : "• No related merge request in the Orbit context",
    result.correlation.workItem
      ? `✓ Related work item identified: #${result.correlation.workItem.iid}`
      : "• No related work item in the Orbit context",
    "",
    "Root cause:",
    result.rootCause.summary,
    "",
    "Confidence:",
    result.rootCause.confidence.toUpperCase(),
    "",
    "Proposed repair:",
    repair ? `${repair.relativePath}\n  ${repair.before}\n→ ${repair.after}` : "None. Context did not support a safe change.",
    "",
    "Validation:",
    result.validation ? `${result.validation.passed} tests passed` : "Not run",
    "",
    result.applied
      ? "Repair applied inside the demo fixture. No merge or deployment was performed."
      : "Human approval required before applying changes.",
    result.mergeRequestAction,
    `Report: ${result.reportPath}`,
  ]
  return lines.join("\n")
}

async function mergeRequestDecision(options: GuardianOptions, summary: string): Promise<string> {
  if (!options.createMr) {
    return "No merge request was opened. Investigation stays read-only unless --create-mr is set."
  }
  try {
    assertCreateMergeRequestAllowed({
      createMr: true,
      live: options.live ?? false,
      sourceBranch: options.sourceBranch,
    })
    const config = readGitlabConfig(options.env ?? process.env)
    if (!config) {
      throw new Error("Refusing to create a merge request without GitLab credentials. No request was sent.")
    }
    const created = await createMergeRequest(config, {
      sourceBranch: options.sourceBranch ?? "",
      targetBranch: "main",
      title: "Orbit Guardian: update the profile response consumer",
      description: `${summary}\n\nOpened by Orbit Guardian. This merge request is not merged automatically.`,
    })
    return `Opened merge request !${created.iid} at ${created.webUrl}. It was not merged.`
  } catch (error) {
    return error instanceof Error ? error.message : "Merge request creation was refused."
  }
}

async function selectPipelineClient(live: boolean, env: NodeJS.ProcessEnv): Promise<PipelineClient> {
  if (!live) return new MockPipelineClient()
  const config = readGitlabConfig(env)
  if (!config) {
    throw new Error("Live mode needs GITLAB_URL, GITLAB_TOKEN, and GITLAB_PROJECT_ID. Mock data was not used.")
  }
  return new GitlabPipelineClient(config)
}

async function selectOrbitClient(live: boolean, env: NodeJS.ProcessEnv): Promise<OrbitClient> {
  if (!live) return new MockOrbitClient()
  const config = readGitlabConfig(env)
  if (!config) {
    throw new Error("Live mode needs GITLAB_URL, GITLAB_TOKEN, and GITLAB_PROJECT_ID. Mock data was not used.")
  }
  return new GitlabOrbitClient(config)
}

function fixtureDir(projectRoot: string): string {
  return join(projectRoot, "src", "fixtures", "failing-project")
}

function fixtureFile(projectRoot: string): string {
  return join(fixtureDir(projectRoot), "src", "services", "user-service.ts")
}
