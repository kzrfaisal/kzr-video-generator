import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseMetadataMarkdown } from './metadata';
import { reconcileScenes, scriptToLegacyText } from './script';
import { migrateProjectDocument, readProjectDocument } from '@/src/infrastructure/storage/localProjectStore';

test('creates structured explainer scenes and a legacy export', () => {
  const scenes = reconcileScenes('HOST|Opening idea\nHOST|Supporting detail\n', 'narrated-explainer');
  assert.deepEqual(scenes.map(scene => scene.id), ['scene-001', 'scene-002']);
  assert.equal(scenes[0].visualType, 'stock-photo');
  assert.equal(scriptToLegacyText(scenes), 'HOST|Opening idea\nHOST|Supporting detail\n');
});

test('preserves stable scene IDs when narration is edited or inserted', () => {
  const original = reconcileScenes('HOST|First\nHOST|Second\n', 'narrated-explainer');
  const edited = reconcileScenes('HOST|New opening\nHOST|First\nHOST|Second updated\n', 'narrated-explainer', original);
  assert.equal(edited[1].id, original[0].id);
  assert.equal(edited[2].id, original[1].id);
  assert.equal(edited[0].id, 'scene-003');
});

test('rejects debate speakers in an explainer', () => {
  assert.throws(
    () => reconcileScenes('A|This should not be here', 'narrated-explainer'),
    /Explainers must use HOST/,
  );
});

test('parses publishing metadata into the project model', () => {
  const metadata = parseMetadataMarkdown(`## YouTube Title
A useful title

## YouTube Description
A useful description

## Hashtags
#History #LEARNING

## Thumbnail Hook
THE KEY IDEA

## Reel 1 — Opening Caption
Opening

## Reel 2 — Rebuttals Caption
Middle

## Reel 3 — Closing Caption
Closing`);

  assert.equal(metadata.youtube.title, 'A useful title');
  assert.deepEqual(metadata.youtube.hashtags, ['#history', '#learning']);
  assert.equal(metadata.reels[2].caption, 'Closing');
  assert.equal(metadata.thumbnailHook, 'THE KEY IDEA');
});

test('loads a legacy project and explicitly migrates it to the versioned schema', () => {
  const originalDirectory = process.cwd();
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kzr-project-model-'));
  try {
    process.chdir(temporaryDirectory);
    fs.mkdirSync('output/debates', { recursive: true });
    fs.writeFileSync('output/debates/debate1.project.json', JSON.stringify({
      topic: 'Legacy title',
      context: 'Legacy context',
      config: { contentMode: 'debate' },
    }));
    fs.writeFileSync('output/debates/debate1.txt', 'HOST|Welcome\nA|First view\nB|Second view\n');

    const adapted = readProjectDocument('debate1');
    assert.equal(adapted.title, 'Legacy title');
    assert.equal(adapted.scenes.length, 3);

    const migrated = migrateProjectDocument('debate1');
    const saved = JSON.parse(fs.readFileSync('output/debates/debate1.project.json', 'utf-8'));
    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.scenes[0].id, migrated.scenes[0].id);
    assert.equal(fs.readFileSync('output/debates/debate1.txt', 'utf-8'), 'HOST|Welcome\nA|First view\nB|Second view\n');
  } finally {
    process.chdir(originalDirectory);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
