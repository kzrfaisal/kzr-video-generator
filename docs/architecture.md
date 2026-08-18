# Source architecture

The codebase is organized by responsibility so UI, pipeline, and provider changes can
evolve independently.

```text
src/
  domain/            Provider-independent project and pipeline data/rules
  features/
    pipeline/        Workflow orchestration and CLI pipeline entry points
    projects/        Project-level behavior
    publishing/      YouTube and Instagram publishing
    reels/           Short-form extraction and rendering
    rendering/       Audio/video assembly and output discovery
    scripts/         Script and metadata generation
    visuals/         Visual planning, thumbnails, and infographic overlays
  infrastructure/
    jobs/            Durable local background-job implementation
    process/         Child-process stage runner
    storage/         Atomic local project and pipeline persistence
  services/
    openai/          OpenAI schemas, prompts, and structured-output adapter
  shared/            Cross-feature utilities and filesystem paths
```

Dependency direction:

1. `domain` has no dependency on features, infrastructure, or providers.
2. `features` may use domain types and explicit infrastructure/service adapters.
3. `infrastructure` implements local runtime concerns such as files and jobs.
4. `services` owns third-party API integration details.
5. `app` contains HTTP/UI entry points and delegates work to the layers above.

`main.ts` and `config.ts` remain at the repository root as public CLI and user
configuration entry points. New implementation files should be added to the matching
folder above instead of directly under `src/`.
