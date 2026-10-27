import { execFile } from "node:child_process"
import { mkdtemp, cp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"

const execFileAsync = promisify(execFile)

export type ValidationCheck = {
  name: string
  passed: boolean
  detail: string
}

export type ValidationReport = {
  passed: number
  failed: number
  checks: ValidationCheck[]
}

export function contractChecks(source: string, replacementExpression: string, previousExpression: string): ValidationCheck[] {
  return [
    {
      name: "Consumer uses the new response field",
      passed: source.includes(replacementExpression),
      detail: replacementExpression,
    },
    {
      name: "Consumer no longer reads the previous field",
      passed: !source.includes(previousExpression),
      detail: previousExpression,
    },
  ]
}

export async function validateProposal(
  repairedSource: string,
  fixtureDir: string,
  projectRoot: string,
  replacementExpression: string,
  previousExpression: string,
): Promise<ValidationReport> {
  const checks = contractChecks(repairedSource, replacementExpression, previousExpression)
  const typecheck = await typecheckRepairedFixture(fixtureDir, projectRoot, repairedSource)
  checks.push(typecheck)
  const passed = checks.filter((check) => check.passed).length
  return { passed, failed: checks.length - passed, checks }
}

async function typecheckRepairedFixture(
  fixtureDir: string,
  projectRoot: string,
  repairedSource: string,
): Promise<ValidationCheck> {
  const directory = await mkdtemp(join(tmpdir(), "orbit-guardian-"))
  try {
    await cp(fixtureDir, directory, { recursive: true })
    await writeFile(join(directory, "src/services/user-service.ts"), repairedSource)
    const tsc = join(projectRoot, "node_modules/typescript/lib/tsc.js")
    try {
      await execFileAsync(process.execPath, [tsc, "--noEmit", "-p", directory], { timeout: 20000 })
      return { name: "Typecheck of the repaired fixture", passed: true, detail: "tsc --noEmit passed" }
    } catch (error) {
      const detail = error instanceof Error ? error.message.split("\n").slice(0, 4).join(" ") : "tsc failed"
      return { name: "Typecheck of the repaired fixture", passed: false, detail }
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export function projectRootFrom(importMetaUrl: string): string {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "../..")
}
