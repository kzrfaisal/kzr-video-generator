# OpenAI generation layer

Script, publishing-metadata, and visual-plan generation use the Responses API with
Zod-backed Structured Outputs.

- `src/services/openai/structuredOutput.ts` owns the Responses API call.
- `src/services/openai/schemas.ts` defines the accepted output contracts.
- `src/services/openai/prompts.ts` contains versioned application instructions.
- Developer messages contain product rules; user messages contain title, context,
  content mode, and project data.
- Responses are requested with `store: false`.
- Prompt versions and response IDs are recorded under `project.config.generation`.

The older prompt text files under `source/` are retained as historical references but
are not loaded by the active generation pipeline.

The implementation follows the official OpenAI documentation for
[text generation](https://developers.openai.com/api/docs/guides/text) and
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Run the offline contracts without making an API request:

```bash
npm run test:unit
```

