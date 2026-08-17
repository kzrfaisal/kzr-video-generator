# Project schema

`output/debates/<project>.project.json` is the source of truth for a project. The
neighboring `.txt` script and publishing `.metadata.md` file remain compatibility
exports for the CLI and existing tools; application edits update the JSON first.

```json
{
  "schemaVersion": 1,
  "id": "debate43",
  "title": "How Ancient Rome shaped the modern world",
  "context": "Focus on law, infrastructure, and language.",
  "contentMode": "narrated-explainer",
  "scenes": [
    {
      "id": "scene-001",
      "speaker": "HOST",
      "narration": "Rome's influence reaches far beyond its surviving ruins.",
      "headline": "A living legacy",
      "visualQuery": "ancient roman forum sunrise",
      "visualType": "stock-photo",
      "visualAssetPath": "output/visuals/debate43/visual-scene-001.jpg",
      "durationHintSeconds": null,
      "overlays": [
        { "id": "scene-001-headline", "type": "headline", "text": "A living legacy" }
      ],
      "status": "ready"
    }
  ],
  "metadata": null,
  "config": { "contentMode": "narrated-explainer" },
  "createdAt": "2026-08-18T00:00:00.000Z",
  "updatedAt": "2026-08-18T00:00:00.000Z"
}
```

## Compatibility

- New projects are written in schema version 1 immediately.
- Existing `{ topic, context, config }` project files are adapted in memory.
- A legacy project is upgraded when the application next saves its script, config,
  metadata, or visual plan.
- Stable scene IDs are preserved across ordinary narration edits and insertions.
- Reel scripts remain derived text exports for now; they are not independent projects.

Do not edit the `.txt` export directly. Edit through the application or update the
project JSON; later saves regenerate the text export from the structured scenes.
