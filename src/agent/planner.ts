export const WORKFLOW = [
  "Reading failed pipeline",
  "Collecting failure evidence",
  "Querying GitLab Orbit context",
  "Correlating recent changes",
  "Building root-cause hypothesis",
  "Validating proposed repair",
  "Generating investigation report",
] as const

export type WorkflowStep = (typeof WORKFLOW)[number]
