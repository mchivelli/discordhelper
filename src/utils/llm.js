// LLM provider abstraction layer
// Supports Anthropic Claude SDK with OpenRouter fallback

let Anthropic = null;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (e) {
  console.log('Anthropic SDK not available, will use OpenRouter fallback');
}

// Cache a single Anthropic client at module level (avoids reconstructing on every call).
let anthropicClient = null;
function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY || !Anthropic) return null;
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

// Resolve which model to use for the Anthropic SDK path.
// Anthropic SDK is strictly opt-in: requires BOTH a key AND an explicit model env var.
// If model isn't set, we fall through to OpenRouter (which can proxy any model, including Anthropic).
function resolveAnthropicModel(speed, override) {
  if (override) return override;
  if (speed === 'smart') return process.env.CLAUDE_SMART_MODEL || null;
  return process.env.CLAUDE_FAST_MODEL || null;
}

/**
 * Call LLM with Anthropic SDK (primary) or OpenRouter (fallback)
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} opts
 * @param {number} opts.maxTokens - default 200
 * @param {string} opts.model - override model name
 * @param {string} opts.speed - 'fast' (default) or 'smart' — determines which CLAUDE_*_MODEL env var to read
 * @param {boolean} opts.throwOnError - default false
 * @returns {Promise<string>} - response text
 */
async function callLLM(messages, opts = {}) {
  const { maxTokens = 200, model, speed = 'fast', throwOnError = false } = opts;

  // Anthropic SDK path — only if key, SDK, and explicit model are all available
  const anthropicModel = resolveAnthropicModel(speed, model);
  const client = anthropicModel ? getAnthropicClient() : null;
  if (client) {
    try {
      // Concatenate all system messages (Anthropic SDK takes a single system string)
      const systemParts = messages.filter(m => m.role === 'system').map(m => m.content).filter(Boolean);
      const systemMsg = systemParts.join('\n\n');
      const userMsgs = messages.filter(m => m.role !== 'system');

      const response = await client.messages.create({
        model: anthropicModel,
        max_tokens: maxTokens,
        system: systemMsg || undefined,
        messages: userMsgs
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Anthropic API error:', error.message);
      if (throwOnError) throw error;
      // Fall through to OpenRouter fallback
    }
  }

  // Fallback to OpenRouter (works for any model slug, including 'anthropic/claude-haiku-4-5')
  return await callOpenRouter(messages, maxTokens, model, speed, throwOnError);
}

/**
 * Convenience wrapper for fast LLM (cheap model)
 */
async function callLLMFast(messages, maxTokens = 200) {
  return await callLLM(messages, { maxTokens, speed: 'fast' });
}

/**
 * Convenience wrapper for smart LLM (expensive model)
 */
async function callLLMSmart(messages, maxTokens = 500) {
  return await callLLM(messages, { maxTokens, speed: 'smart' });
}

/**
 * OpenRouter fallback implementation.
 * Model resolution order:
 *   1. explicit `model` arg
 *   2. speed-tier env var: LLM_SMART_MODEL (smart) / LLM_FAST_MODEL (fast)
 *   3. generic MODEL_NAME env var (legacy, used by older code paths)
 *   4. cheap default
 */
async function callOpenRouter(messages, maxTokens, model, speed, throwOnError) {
  if (!process.env.OPENROUTER_API_KEY) {
    if (throwOnError) throw new Error('No API key configured');
    return '';
  }

  const tierModel = speed === 'smart'
    ? process.env.LLM_SMART_MODEL
    : process.env.LLM_FAST_MODEL;
  const resolvedModel =
    model
    || tierModel
    || process.env.MODEL_NAME
    || 'anthropic/claude-haiku-4-5';

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('OpenRouter API error:', error.message);
    if (throwOnError) throw error;
    return '';
  }
}

module.exports = {
  callLLM,
  callLLMFast,
  callLLMSmart
};
