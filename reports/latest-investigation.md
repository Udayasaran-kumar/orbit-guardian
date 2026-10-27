# Orbit Guardian Investigation

## Pipeline

- Project: `example-group/orbit-guardian-demo`
- Pipeline: #184
- Job: typecheck (#90211)
- Stage: test
- Status: failed
- Orbit mode: mock

## Failure

src/services/user-service.ts(4,34): error TS2551: Property 'name' does not exist on type 'UserProfile'. Did you mean 'displayName'?

## Evidence

- Pipeline #184 failed during typecheck.
- src/services/user-service.ts(4,34): error TS2551: Property 'name' does not exist on type 'UserProfile'. Did you mean 'displayName'?
- Merge request !42 (“Refactor user profile API”) changed src/types/profile.ts, src/services/user-service.ts.
- Work item #91 (“Update profile response contract”) is linked to that change.
- The compiler still reads user.profile.name, while the linked work item and merge request describe displayName.

## Orbit Context

- Project: orbit-guardian-demo (`example-group/orbit-guardian-demo`)
- Demo project whose profile API response contract changed.
- Code: `src/types/profile.ts`, `src/services/user-service.ts`
- Ownership context: Mina Rao (merge-request-author)
- Security findings: none were present in the Orbit context for this failure

## Related Changes

- !42 — Refactor user profile API
- #91 — Update profile response contract

## Root Cause

The consumer still expects the previous profile response contract.

## Confidence

HIGH

## Proposed Repair

- File: `src/services/user-service.ts`
- `user.profile.name`
- → `user.profile.displayName`

```diff
- user.profile.name
+ user.profile.displayName
```

## Validation

3 tests passed, 0 failed.
- PASS Consumer uses the new response field: user.profile.displayName
- PASS Consumer no longer reads the previous field: user.profile.name
- PASS Typecheck of the repaired fixture: tsc --noEmit passed

## Human Approval

No files were changed. Re-run with `--apply` to write the repair inside the demo fixture.

No merge request was opened. Investigation stays read-only unless --create-mr is set.
