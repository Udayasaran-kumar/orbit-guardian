export const DEMO_PROJECT_PATH = "example-group/orbit-guardian-demo"
export const DEMO_PROJECT_NAME = "orbit-guardian-demo"
export const DEMO_PIPELINE_ID = 184
export const DEMO_JOB_ID = 90211
export const CONSUMER_PATH = "src/services/user-service.ts"
export const PREVIOUS_PROPERTY = "name"
export const REPLACEMENT_PROPERTY = "displayName"

export const BROKEN_USER_SERVICE = `import type { User } from "../types/profile"

export function greeting(user: User): string {
  return \`Hello, \${user.profile.name}\`
}
`

export const PIPELINE_LOG = `Running with gitlab-runner 17.0.0
Preparing the "docker" executor
$ npm run typecheck

> orbit-guardian-demo@0.1.0 typecheck
> tsc --noEmit

src/services/user-service.ts(4,34): error TS2551: Property 'name' does not exist on type 'UserProfile'. Did you mean 'displayName'?

Found 1 error in src/services/user-service.ts:4
ERROR: Job failed: exit status 1
`

export const MERGE_REQUEST = {
  iid: 42,
  title: "Refactor user profile API",
  description:
    "The profile response now returns displayName instead of name. Consumers must read user.profile.displayName.",
  author: "Mina Rao",
  changedFiles: ["src/types/profile.ts", "src/services/user-service.ts"],
}

export const WORK_ITEM = {
  iid: 91,
  title: "Update profile response contract",
  description:
    "Replace the profile name field with displayName so clients use the new response contract from MR !42.",
  relatedMergeRequestIids: [42],
}
