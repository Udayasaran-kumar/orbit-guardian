# Demo script

About two and a half minutes. No background music. Say that the demo is local extraction of a failed job plus a mock Orbit context. Do not say a live model investigated the pipeline.

1. Show the README title and the one-line description: context-aware pipeline failure investigation, not an open-ended code writer.
2. Show the broken consumer in `src/fixtures/failing-project/src/services/user-service.ts`: it still reads `user.profile.name`.
3. Run:

```bash
npm run guardian -- demo
```

4. Point at pipeline #184 and status FAILED.
5. Point at `[2/7]` and the TypeScript error in `user-service.ts`.
6. Point at `[3/7]` and say this step is the Orbit context query. In the demo it is the mock adapter, so the recording does not depend on a token.
7. Point at `Related MR identified: !42` and `Related work item identified: #91`.
8. Read the root cause: the consumer still expects the previous profile response contract. Read confidence HIGH.
9. Show the proposed replacement: `user.profile.name` to `user.profile.displayName`.
10. Show `3 tests passed` and the line that human approval is required.
11. Open `reports/latest-investigation.md` and scroll through Evidence, Orbit Context, and Human Approval.
12. If the first run was stable, run:

```bash
npm run guardian -- investigate --apply
```

Show the fixture now reading `displayName`, and say no merge request was opened.

13. Restore the demo with `npm run guardian -- reset`.
14. Close by saying the same `OrbitClient` interface is what `--live` uses against `POST /api/v4/orbit/context`, and that live mode will not substitute the fixture if Orbit returns nothing.
