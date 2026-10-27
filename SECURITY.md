# Security

Orbit Guardian investigates CI failures. It is not a service that stores tokens or applies production changes on its own.

## Credentials

- Put `GITLAB_URL`, `GITLAB_TOKEN`, and `GITLAB_PROJECT_ID` in the environment or in an untracked `.env` file.
- `.env.example` contains empty placeholders only.
- Do not commit tokens, job traces from private projects, or personal access tokens.
- `npm run guardian -- demo` does not read the token.

## Default behavior

- Investigation is read-only.
- The mock adapter does not make network calls.
- Live mode fails closed when credentials are missing. It does not replace a failed Orbit response with demo data.

## Changes

- Writing the demo fixture requires `--apply`.
- The allowed path is the fixture consumer, `src/services/user-service.ts`.
- Creating a merge request requires `--create-mr`, `--live`, and `--source-branch`.
- The tool does not push branches and does not merge merge requests.

## Production use

Use a least-privilege token. For read-only investigation, grant only the project and Orbit read scopes needed to view pipelines, job logs, and Orbit context. Do not use a maintainer token for the demo. Review `reports/latest-investigation.md` before applying a repair in any repository you care about.
