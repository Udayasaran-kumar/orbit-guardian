# Evaluation notes

These notes map Orbit Guardian to the Showcase criteria. They describe what the repository actually does.

## 1. Technological implementation

The workflow is executable TypeScript. `npm run guardian -- demo` runs offline. `npm test` covers parsing, evidence, correlation, root cause, the patch, safety, validation, and the report. `npm run build` typechecks the project. The live path calls GitLab pipeline REST endpoints and `POST /api/v4/orbit/context`. The mock path is a separate class and is labeled `mock` in the report.

## 2. Design and usability

The demo is one command. The terminal shows seven numbered steps, the failed pipeline, the related merge request, the related work item, the hypothesis, the proposed edit, and the validation count. The Markdown report uses the same headings so a judge can read the result without rerunning the tool.

## 3. Potential impact

Failed pipelines are where delivery context is missing. Connecting a compiler error to the merge request and work item that changed the contract shortens the time a developer spends reconstructing that story from several pages. The repair stays a proposal until a person passes `--apply`.

## 4. Quality of the idea

The idea is supervised investigation, not autonomous code generation. Orbit is useful here because the decision depends on relationships across the lifecycle, not on a second reading of the same log. The fixture makes that relationship visible: pipeline #184, `user-service.ts`, MR !42, and work item #91.

## What is not claimed

- The demo does not contact GitLab.
- The project is not already published in the AI Catalog.
- The repair is not a general patch generator.
- No security finding is invented for the fixture.
