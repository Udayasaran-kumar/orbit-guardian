import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { Correlation } from "../agent/investigator"
import type { ProposedRepair } from "../agent/repair"
import type { RootCause } from "../analysis/root-cause"
import type { ValidationReport } from "../validation/test-runner"
import type { FailureEvidence, OrbitFailureContext } from "../orbit/orbit-types"

export type InvestigationReportInput = {
  evidence: FailureEvidence
  context: OrbitFailureContext
  correlation: Correlation
  rootCause: RootCause
  repair: ProposedRepair | null
  validation: ValidationReport | null
  applied: boolean
  mergeRequestAction: string
}

export function renderInvestigationMarkdown(input: InvestigationReportInput): string {
  const repair = input.repair
  const validation = input.validation
  const lines = [
    "# Orbit Guardian Investigation",
    "",
    "## Pipeline",
    "",
    `- Project: \`${input.evidence.projectPath}\``,
    `- Pipeline: #${input.evidence.pipelineId}`,
    `- Job: ${input.evidence.jobName} (#${input.evidence.jobId})`,
    `- Stage: ${input.evidence.stage}`,
    `- Status: failed`,
    `- Orbit mode: ${input.context.mode}`,
    "",
    "## Failure",
    "",
    input.evidence.message,
    "",
    "## Evidence",
    "",
    ...input.rootCause.evidence.map((item) => `- ${item}`),
    "",
    "## Orbit Context",
    "",
    `- Project: ${input.context.project.name} (\`${input.context.project.path}\`)`,
    `- ${input.context.project.description}`,
    input.context.code.files.length
      ? `- Code: ${input.context.code.files.map((file) => `\`${file.path}\``).join(", ")}`
      : "- Code: no related files were returned",
    input.correlation.ownership
      ? `- Ownership context: ${input.correlation.ownership.name} (${input.correlation.ownership.source})`
      : "- Ownership context: none returned",
    input.context.securityFindings.length
      ? `- Security findings: ${input.context.securityFindings.map((finding) => finding.title).join(", ")}`
      : "- Security findings: none were present in the Orbit context for this failure",
    "",
    "## Related Changes",
    "",
    input.correlation.mergeRequest
      ? `- !${input.correlation.mergeRequest.iid} — ${input.correlation.mergeRequest.title}`
      : "- No related merge request",
    input.correlation.workItem
      ? `- #${input.correlation.workItem.iid} — ${input.correlation.workItem.title}`
      : "- No related work item",
    "",
    "## Root Cause",
    "",
    input.rootCause.summary,
    "",
    "## Confidence",
    "",
    input.rootCause.confidence.toUpperCase(),
    "",
    "## Proposed Repair",
    "",
    repair
      ? [
          `- File: \`${repair.relativePath}\``,
          `- \`${repair.before}\``,
          `- → \`${repair.after}\``,
          "",
          "```diff",
          `- ${repair.before}`,
          `+ ${repair.after}`,
          "```",
        ].join("\n")
      : "No repair proposed. The Orbit context did not support a safe change.",
    "",
    "## Validation",
    "",
    validation
      ? [
          `${validation.passed} tests passed, ${validation.failed} failed.`,
          ...validation.checks.map((check) => `- ${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`),
        ].join("\n")
      : "Validation did not run because no repair was proposed.",
    "",
    "## Human Approval",
    "",
    input.applied
      ? "The repair was written only after `--apply`. No merge and no deployment were performed."
      : "No files were changed. Re-run with `--apply` to write the repair inside the demo fixture.",
    "",
    input.mergeRequestAction,
    "",
  ]
  return `${lines.join("\n")}\n`
}

export async function writeInvestigationReport(path: string, markdown: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, markdown)
}
