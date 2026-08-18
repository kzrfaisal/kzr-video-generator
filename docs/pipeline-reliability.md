# Pipeline reliability

Each project has durable stage progress in `output/pipelines/<project>.json`. This file
records whether every stage is pending, running, completed, or failed, together with its
attempt count and latest error.

Long operations also create an atomic job record in `output/jobs/<job-id>.json`. A retry
creates a new job attempt while retaining outputs completed by other stages. If the app
restarts during a job, that attempt is marked failed on the next job API request and the
same stage can be started again safely.

Editing an upstream input invalidates only affected downstream stages:

- Script edits invalidate metadata, visuals, audio, videos, reels, and publishing.
- Metadata edits invalidate the thumbnail and publishing.
- Visual edits invalidate video, reels, and publishing.
- Reel-script edits invalidate reels and publishing.
- Voice, render, or visual configuration changes invalidate their dependent outputs.

Project, pipeline, and job JSON files are written through a temporary sibling followed
by an atomic rename. This prevents a stopped process from leaving partially written JSON.

This remains a local single-worker implementation. The domain stage model is independent
of the local files, allowing the infrastructure layer to be replaced later by a database,
queue, and object storage without changing generation features.
