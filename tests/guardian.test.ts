import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, describe, expect, it } from "vitest"
import { correlate } from "../src/agent/investigator"
import { resetFixture, runInvestigation } from "../src/agent/guardian"
import { proposeRepair, resolveAllowedTarget } from "../src/agent/repair"
import { parseCompilerFailure } from "../src/analysis/failure-analyzer"
import { collectEvidence } from "../src/analysis/evidence"
import { determineRootCause } from "../src/analysis/root-cause"
import { BROKEN_USER_SERVICE, PIPELINE_LOG } from "../src/fixtures/scenario"
import { readGitlabConfig } from "../src/gitlab/gitlab-client"
import { assertCreateMergeRequestAllowed } from "../src/gitlab/merge-request-client"
import { MockPipelineClient } from "../src/gitlab/pipeline-client"
import { MockOrbitClient } from "../src/orbit/mock-orbit-client"
import { firstEntity, normalizeMergeRequest, normalizeWorkItems } from "../src/orbit/orbit-client"
import type { OrbitClient, OrbitFailureContext } from "../src/orbit/orbit-types"
import { renderInvestigationMarkdown } from "../src/reports/report-generator"
import { contractChecks, validateProposal } from "../src/validation/test-runner"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")

afterAll(async () => {
  await resetFixture(projectRoot)
})

describe("Orbit Guardian", () => {
  it("parses the TypeScript contract failure from the pipeline log", () => {
    const parsed = parseCompilerFailure(PIPELINE_LOG)
    expect(parsed).toMatchObject({
      filePath: "src/services/user-service.ts",
      line: 4,
      missingProperty: "name",
      suggestedProperty: "displayName",
      typeName: "UserProfile",
    })
  })

  it("does not invent a compiler failure from an unrelated log", () => {
    expect(parseCompilerFailure("ERROR: docker pull failed")).toBeNull()
  })

  it("collects evidence from the failed demo pipeline", async () => {
    const pipeline = await new MockPipelineClient().getFailedPipeline()
    const evidence = collectEvidence(pipeline)
    expect(evidence.pipelineId).toBe(184)
    expect(evidence.filePath).toBe("src/services/user-service.ts")
    expect(evidence.jobName).toBe("typecheck")
    expect(evidence.logExcerpt).toContain("TS2551")
  })

  it("retrieves mock Orbit context for the demo failure", async () => {
    const context = await new MockOrbitClient().investigateFailure({
      projectPath: "example-group/orbit-guardian-demo",
      pipelineId: 184,
      jobId: 90211,
      jobWebUrl: null,
      filePath: "src/services/user-service.ts",
    })
    expect(context.mode).toBe("mock")
    expect(context.mergeRequest?.iid).toBe(42)
    expect(context.workItems[0]?.iid).toBe(91)
    expect(context.securityFindings).toEqual([])
    expect(context.ownership?.name).toBe("Mina Rao")
  })

  it("correlates the failed file with the merge request and work item", async () => {
    const pipeline = await new MockPipelineClient().getFailedPipeline()
    const evidence = collectEvidence(pipeline)
    const context = await new MockOrbitClient().investigateFailure({
      projectPath: evidence.projectPath,
      pipelineId: evidence.pipelineId,
      jobId: evidence.jobId,
      jobWebUrl: null,
      filePath: evidence.filePath,
    })
    const correlation = correlate(evidence, context)
    expect(correlation.mergeRequestTouchedFile).toBe(true)
    expect(correlation.workItem?.title).toBe("Update profile response contract")
    expect(correlation.contextMentionsReplacement).toBe(true)
  })

  it("builds a high-confidence root cause from linked SDLC evidence", async () => {
    const result = await runInvestigation({ projectRoot })
    expect(result.rootCause.confidence).toBe("high")
    expect(result.rootCause.summary).toBe("The consumer still expects the previous profile response contract.")
    expect(result.rootCause.summary).not.toBe("Fix the TypeScript error.")
    expect(result.rootCause.evidence.join("\n")).toContain("!42")
    expect(result.rootCause.evidence.join("\n")).toContain("#91")
    expect(result.steps).toHaveLength(7)
  })

  it("refuses a repair when Orbit context does not support the compiler suggestion", async () => {
    const orbitClient: OrbitClient = {
      mode: "mock",
      async investigateFailure(): Promise<OrbitFailureContext> {
        return {
          mode: "mock",
          project: { path: "example-group/orbit-guardian-demo", name: "orbit-guardian-demo", description: "Empty." },
          code: { files: [] },
          mergeRequest: null,
          workItems: [],
          pipeline: { id: 184, status: "failed", failedJob: "typecheck" },
          ownership: null,
          securityFindings: [],
        }
      },
    }
    const result = await runInvestigation({ projectRoot, orbitClient })
    expect(result.rootCause.confidence).toBe("low")
    expect(result.repair).toBeNull()
    expect(result.validation).toBeNull()
    expect(result.applied).toBe(false)
  })

  it("proposes only the profile field replacement", async () => {
    const pipeline = await new MockPipelineClient().getFailedPipeline()
    const evidence = collectEvidence(pipeline)
    const context = await new MockOrbitClient().investigateFailure({
      projectPath: evidence.projectPath,
      pipelineId: evidence.pipelineId,
      jobId: evidence.jobId,
      jobWebUrl: null,
      filePath: evidence.filePath,
    })
    const repair = proposeRepair(BROKEN_USER_SERVICE, evidence.filePath, determineRootCause(evidence, correlate(evidence, context)))
    expect(repair?.before).toBe("user.profile.name")
    expect(repair?.after).toBe("user.profile.displayName")
    expect(repair?.repairedSource).not.toContain("user.profile.name")
    expect(repair?.repairedSource).toContain("export function greeting")
  })

  it("rejects writes outside the demo fixture and leaves the file unchanged without --apply", async () => {
    const fixture = join(projectRoot, "src/fixtures/failing-project")
    expect(() => resolveAllowedTarget(fixture, "../../package.json")).toThrow(/outside the demo fixture/)
    expect(() => resolveAllowedTarget(fixture, "src/types/profile.ts")).toThrow(/only src\/services\/user-service.ts/)

    const result = await runInvestigation({ projectRoot, apply: false })
    const source = await readFile(join(fixture, "src/services/user-service.ts"), "utf8")
    expect(result.applied).toBe(false)
    expect(source).toContain("user.profile.name")
    expect(result.mergeRequestAction).toContain("No merge request was opened")
  })

  it("applies the repair only inside a copy of the fixture when asked", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbit-guardian-safety-"))
    const fixture = join(directory, "failing-project")
    const { cp } = await import("node:fs/promises")
    await cp(join(projectRoot, "src/fixtures/failing-project"), fixture, { recursive: true })
    const target = join(fixture, "src/services/user-service.ts")
    await writeFile(target, BROKEN_USER_SERVICE)
    const pipeline = await new MockPipelineClient().getFailedPipeline()
    const evidence = collectEvidence(pipeline)
    const context = await new MockOrbitClient().investigateFailure({
      projectPath: evidence.projectPath,
      pipelineId: evidence.pipelineId,
      jobId: evidence.jobId,
      jobWebUrl: null,
      filePath: evidence.filePath,
    })
    const repair = proposeRepair(BROKEN_USER_SERVICE, evidence.filePath, determineRootCause(evidence, correlate(evidence, context)))
    if (!repair) throw new Error("expected a repair")
    const { applyRepair } = await import("../src/agent/repair")
    await applyRepair(fixture, repair, true)
    const written = await readFile(target, "utf8")
    expect(written).toContain("user.profile.displayName")
    expect(written).not.toContain("user.profile.name")
  })

  it("validates the repaired source and fails the broken source", async () => {
    const broken = contractChecks(BROKEN_USER_SERVICE, "user.profile.displayName", "user.profile.name")
    expect(broken.every((check) => check.passed)).toBe(false)

    const repaired = BROKEN_USER_SERVICE.replaceAll("user.profile.name", "user.profile.displayName")
    const report = await validateProposal(
      repaired,
      join(projectRoot, "src/fixtures/failing-project"),
      projectRoot,
      "user.profile.displayName",
      "user.profile.name",
    )
    expect(report.passed).toBe(3)
    expect(report.failed).toBe(0)
  })

  it("writes the investigation report with the required sections", async () => {
    const result = await runInvestigation({ projectRoot })
    const markdown = await readFile(result.reportPath, "utf8")
    for (const heading of [
      "# Orbit Guardian Investigation",
      "## Pipeline",
      "## Failure",
      "## Evidence",
      "## Orbit Context",
      "## Related Changes",
      "## Root Cause",
      "## Confidence",
      "## Proposed Repair",
      "## Validation",
      "## Human Approval",
    ]) {
      expect(markdown).toContain(heading)
    }
    expect(markdown).toContain("mock")
    expect(renderInvestigationMarkdown({
      evidence: result.evidence,
      context: result.context,
      correlation: result.correlation,
      rootCause: result.rootCause,
      repair: result.repair,
      validation: result.validation,
      applied: false,
      mergeRequestAction: result.mergeRequestAction,
    })).toContain("!42")
  })

  it("refuses merge request creation unless live mode has an existing branch", () => {
    expect(() => assertCreateMergeRequestAllowed({ createMr: false, live: true, sourceBranch: "fix" })).toThrow(/--create-mr/)
    expect(() => assertCreateMergeRequestAllowed({ createMr: true, live: false, sourceBranch: "fix" })).toThrow(/--live/)
    expect(() => assertCreateMergeRequestAllowed({ createMr: true, live: true })).toThrow(/--source-branch/)
    expect(readGitlabConfig({})).toBeNull()
  })

  it("normalizes a documented Orbit context payload without adding mock facts", () => {
    const body = {
      version: "1.2.0",
      entities: [
        {
          found: true,
          type: "MergeRequest",
          summary: {
            iid: 42,
            title: "Refactor user profile API",
            description: "displayName replaces name",
            author: { name: "Mina Rao" },
            changed_files: [{ path: "src/services/user-service.ts" }],
            linked_issues: [{ iid: 91, title: "Update profile response contract", token: "WorkItem[91]" }],
          },
        },
      ],
    }
    const entity = firstEntity(body)
    expect(entity?.found).toBe(true)
    expect(normalizeMergeRequest(entity?.summary)?.changedFiles).toEqual(["src/services/user-service.ts"])
    expect(normalizeWorkItems(entity?.summary)[0]?.iid).toBe(91)
    expect(firstEntity({ entities: [{ found: false, error: { code: "not_found" } }] })?.found).toBe(false)
  })

  it("does not fall back to mock data when live credentials are missing", async () => {
    await expect(runInvestigation({ projectRoot, live: true, env: {} })).rejects.toThrow(/Mock data was not used/)
  })
})
