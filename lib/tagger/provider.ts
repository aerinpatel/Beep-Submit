// LLM Provider Adapter (lib/tagger/provider.ts)
// Keeps the provider behind a single function so it can be swapped effortlessly

import { CONFIG } from "../config";
import type { LLMUsage } from "../types";

export interface LLMResponse {
  rawContent: string;
  usage: LLMUsage;
}

/**
 * Single entry point for LLM inference with structured JSON output
 */
export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = CONFIG.llm.temperature
): Promise<LLMResponse> {
  const provider = CONFIG.llm.provider;

  if (provider === "anthropic") {
    return callAnthropic(systemPrompt, userPrompt, temperature);
  }

  // Default: Groq API with fast open-source model (gpt-oss-20b)
  return callGroq(systemPrompt, userPrompt, temperature);
}

/**
 * Groq API implementation with JSON mode
 */
async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<LLMResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is missing");
  }

  const model = CONFIG.llm.model;
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API returned HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content || "{}";

  const usage: LLMUsage = {
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    model,
  };

  return { rawContent, usage };
}

/**
 * Anthropic Claude Haiku fallback implementation
 */
async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required when LLM_PROVIDER is set to anthropic");
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";
  const endpoint = "https://api.anthropic.com/v1/messages";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      max_tokens: 2000,
      temperature,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API returned HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const rawContent = data.content?.[0]?.text || "{}";

  const usage: LLMUsage = {
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
    model,
  };

  return { rawContent, usage };
}
