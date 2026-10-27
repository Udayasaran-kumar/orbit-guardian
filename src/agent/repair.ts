import { resolve, sep } from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import type { RootCause } from "../analysis/root-cause"

export type ProposedRepair = {
  relativePath: string
  before: string
  after: string
  previousExpression: string
  replacementExpression: string
  originalSource: string
  repairedSource: string
}

export class RepairSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RepairSafetyError"
  }
}

export function proposeRepair(source: string, relativePath: string, rootCause: RootCause): ProposedRepair | null {
  if (rootCause.confidence !== "high" || !rootCause.previousExpression || !rootCause.replacementExpression) {
    return null
  }
  if (!source.includes(rootCause.previousExpression)) return null
  const repairedSource = source.replaceAll(rootCause.previousExpression, rootCause.replacementExpression)
  if (repairedSource === source) return null
  return {
    relativePath,
    before: rootCause.previousExpression,
    after: rootCause.replacementExpression,
    previousExpression: rootCause.previousExpression,
    replacementExpression: rootCause.replacementExpression,
    originalSource: source,
    repairedSource,
  }
}

export function resolveAllowedTarget(allowedRoot: string, relativePath: string): string {
  const root = resolve(allowedRoot)
  const target = resolve(root, relativePath)
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new RepairSafetyError(`Refusing to modify ${relativePath}: it is outside the demo fixture.`)
  }
  const allowedFile = resolve(root, "src/services/user-service.ts")
  if (target !== allowedFile) {
    throw new RepairSafetyError(
      `Refusing to modify ${relativePath}: only src/services/user-service.ts may be changed.`,
    )
  }
  return target
}

export async function applyRepair(
  allowedRoot: string,
  repair: ProposedRepair,
  apply: boolean,
): Promise<{ applied: boolean; targetPath: string }> {
  const targetPath = resolveAllowedTarget(allowedRoot, repair.relativePath)
  if (!apply) return { applied: false, targetPath }
  const current = await readFile(targetPath, "utf8")
  if (!current.includes(repair.previousExpression)) {
    throw new RepairSafetyError("Refusing to apply the repair: the expected expression is not in the target file.")
  }
  await writeFile(targetPath, repair.repairedSource)
  return { applied: true, targetPath }
}
