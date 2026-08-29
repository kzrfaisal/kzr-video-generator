import assert from 'node:assert/strict';
import test from 'node:test';
import { speechCostUsd, textCostUsd, usdToInr, USD_TO_INR } from './pricing';

test('calculates gpt-4o-mini token cost including cached input', () => {
  assert.equal(textCostUsd({
    model: 'gpt-4o-mini',
    inputTokens: 1_000_000,
    cachedInputTokens: 200_000,
    outputTokens: 1_000_000,
  }), 0.8 * 0.15 + 0.2 * 0.075 + 0.60);
});

test('calculates speech cost for both configured TTS models', () => {
  assert.equal(speechCostUsd('tts-1', 1_000_000), 15);
  assert.equal(speechCostUsd('tts-1-hd', 1_000_000), 30);
});

test('converts USD estimates through the centralized INR rate', () => {
  assert.equal(usdToInr(2), 2 * USD_TO_INR);
});
