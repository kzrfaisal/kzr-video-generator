import 'dotenv/config';
import fs from 'fs';
import OpenAI from 'openai';
import { config } from '../config';
import { ensureDir } from './utils';
import { publishDir, publishMetadata } from './paths';

const client = new OpenAI();

const METADATA_INPUT_COST_PER_TOKEN  = 0.150 / 1_000_000;
const METADATA_OUTPUT_COST_PER_TOKEN = 0.600 / 1_000_000;

const METADATA_PROMPT_FILE = 'source/metadata_prompt.txt';
const HASHTAG_SEARCH_MODEL = 'gpt-4o-mini-search-preview';

export interface MetadataResult {
  promptTokens: number;
  completionTokens: number;
  cost: number;
}

// Web-search grounded call to fetch popular hashtags for the topic.
// Failure is non-fatal — caller falls back to LLM-only hashtags.
async function fetchPopularHashtags(topic: string, context: string): Promise<{
  hashtags: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
}> {
  const searchPrompt =
    `Search the web for the most popular hashtags currently used on YouTube and Instagram for content about: ${topic}` +
    (context ? `\n\nAdditional framing: ${context}` : '') +
    `\n\nReturn 15-25 hashtags on a SINGLE space-separated line. Every hashtag must start with # and contain only lowercase letters and digits. No explanation, no numbering, no other text.`;

  const response = await client.chat.completions.create({
    model: HASHTAG_SEARCH_MODEL,
    messages: [{ role: 'user', content: searchPrompt }],
  });

  const raw = response.choices[0].message.content ?? '';
  // Keep only # tokens; force lowercase; strip any stray punctuation the model added.
  const hashtags = (raw.match(/#[A-Za-z0-9_]+/g) ?? [])
    .map(h => h.toLowerCase())
    .join(' ');

  const usage = response.usage!;
  const cost =
    usage.prompt_tokens * METADATA_INPUT_COST_PER_TOKEN +
    usage.completion_tokens * METADATA_OUTPUT_COST_PER_TOKEN;

  return {
    hashtags,
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    cost,
  };
}

export async function generateMetadata(
  topic: string,
  context: string,
  scriptContent: string,
  debateName: string,
): Promise<MetadataResult> {
  // Step 1: web-search-grounded hashtag suggestions (non-fatal on failure).
  let suggestedHashtags = '';
  let searchTokensIn = 0;
  let searchTokensOut = 0;
  let searchCost = 0;
  try {
    const search = await fetchPopularHashtags(topic, context);
    suggestedHashtags = search.hashtags;
    searchTokensIn = search.promptTokens;
    searchTokensOut = search.completionTokens;
    searchCost = search.cost;
    console.log(`Fetched ${suggestedHashtags.split(/\s+/).filter(Boolean).length} suggested hashtags via web search.`);
  } catch (err: any) {
    console.warn(`Hashtag web search failed (non-fatal): ${err.message}. Falling back to LLM-only hashtags.`);
  }

  // Step 2: main metadata generation with the suggestions injected.
  const promptTemplate = fs.readFileSync(METADATA_PROMPT_FILE, 'utf-8');
  const prompt = promptTemplate
    .replace('{topic}', topic)
    .replace('{context}', context)
    .replace('{script}', scriptContent)
    .replace('{suggestedHashtags}', suggestedHashtags);

  const response = await client.chat.completions.create({
    model: config.scriptModel,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.choices[0].message.content ?? '';
  // Safety net: force every #hashtag in the generated markdown to lowercase.
  const lowered = content.replace(/#[A-Za-z0-9_]+/g, m => m.toLowerCase());

  ensureDir(publishDir(debateName));
  const outFile = publishMetadata(debateName);
  fs.writeFileSync(outFile, lowered, 'utf-8');
  console.log(`Metadata saved to ${outFile}`);

  const usage = response.usage!;
  const cost =
    usage.prompt_tokens * METADATA_INPUT_COST_PER_TOKEN +
    usage.completion_tokens * METADATA_OUTPUT_COST_PER_TOKEN;

  return {
    promptTokens: usage.prompt_tokens + searchTokensIn,
    completionTokens: usage.completion_tokens + searchTokensOut,
    cost: cost + searchCost,
  };
}