import { projectRootFrom } from "../validation/test-runner"
import { renderCli, resetFixture, runInvestigation } from "../agent/guardian"

const projectRoot = projectRootFrom(import.meta.url)

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args.find((arg) => !arg.startsWith("--")) ?? "help"
  const apply = args.includes("--apply")
  const live = args.includes("--live")
  const createMr = args.includes("--create-mr")
  const sourceBranch = valueAfter(args, "--source-branch")
  const pipelineArg = valueAfter(args, "--pipeline")
  const pipelineId = pipelineArg ? Number(pipelineArg) : undefined

  if (command === "help") {
    console.log(helpText())
    return
  }
  if (command === "reset") {
    await resetFixture(projectRoot)
    console.log("Demo fixture restored to the failing profile contract.")
    return
  }
  if (command !== "demo" && command !== "investigate") {
    console.error(`Unknown command: ${command}`)
    console.error(helpText())
    process.exitCode = 1
    return
  }
  if (pipelineId !== undefined && !Number.isInteger(pipelineId)) {
    console.error("--pipeline must be an integer.")
    process.exitCode = 1
    return
  }

  const result = await runInvestigation({
    projectRoot,
    apply,
    live,
    createMr,
    sourceBranch,
    pipelineId,
  })
  console.log(renderCli(result))
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  return args[index + 1]
}

function helpText(): string {
  return [
    "Orbit Guardian",
    "Context-aware pipeline failure investigation",
    "",
    "npm run guardian -- demo",
    "npm run guardian -- investigate",
    "npm run guardian -- investigate --apply",
    "npm run guardian -- investigate --live --pipeline 184",
    "npm run guardian -- reset",
    "",
    "demo and investigate use the offline fixture unless --live is set.",
    "--apply writes the repair inside the demo fixture. It does not merge or deploy.",
    "--create-mr is refused unless --live and --source-branch are also set.",
  ].join("\n")
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Orbit Guardian failed."
  console.error(message)
  process.exitCode = 1
})
