export type ParsedCompilerFailure = {
  filePath: string
  line: number
  typeName: string
  missingProperty: string
  suggestedProperty: string
  message: string
}

const COMPILER_ERROR =
  /^(.+\.ts)\((\d+),\d+\): error TS\d+: Property '([^']+)' does not exist on type '([^']+)'\. Did you mean '([^']+)'\?/m

export function parseCompilerFailure(log: string): ParsedCompilerFailure | null {
  const match = log.match(COMPILER_ERROR)
  if (!match) return null
  const filePath = match[1]?.trim()
  const line = Number(match[2])
  const missingProperty = match[3]
  const typeName = match[4]
  const suggestedProperty = match[5]
  if (!filePath || !missingProperty || !typeName || !suggestedProperty || !Number.isInteger(line)) return null
  return {
    filePath,
    line,
    typeName,
    missingProperty,
    suggestedProperty,
    message: match[0],
  }
}
