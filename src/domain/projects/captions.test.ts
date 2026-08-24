import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRenderCaptions, splitCaptionText } from './captions';

test('splits long narration into balanced captions of at most sixteen words', () => {
  const words = Array.from({ length: 25 }, (_, index) => `word${index + 1}`);
  const captions = splitCaptionText(words.join(' '));
  assert.deepEqual(captions.map(caption => caption.split(' ').length), [13, 12]);
  assert.equal(captions.join(' '), words.join(' '));
});

test('keeps the source line index for shared scene visuals', () => {
  const captions = buildRenderCaptions([
    { speaker: 'HOST', text: 'one two three' },
    { speaker: 'A', text: Array.from({ length: 17 }, (_, index) => `a${index}`).join(' ') },
  ]);
  assert.deepEqual(captions.map(caption => caption.sourceLineIndex), [0, 1, 1]);
  assert.deepEqual(captions.map(caption => caption.speaker), ['HOST', 'A', 'A']);
});
