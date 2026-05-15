// Moderator AI utilities for toxicity detection, question detection, and report categorization

const { callLLMFast } = require('./llm');
const logger = require('./logger');

const MOD_SENSITIVITY = parseFloat(process.env.MOD_SENSITIVITY || '0.5');

/**
 * Classify message toxicity
 * @param {string} content - Message content
 * @returns {Promise<{classification: string, confidence: number, details: string}>}
 */
async function classifyToxicity(content) {
  const messages = [
    {
      role: 'system',
      content: 'You are a content moderation assistant. Classify the message toxicity level. Return JSON with: classification (safe/low/medium/high), confidence (0-1), details (brief explanation). Be objective and context-aware.'
    },
    {
      role: 'user',
      content: content
    }
  ];

  try {
    const result = await callLLMFast(messages, 200);
    
    // Parse JSON response
    const match = result.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        classification: parsed.classification || 'safe',
        confidence: parsed.confidence || 0,
        details: parsed.details || ''
      };
    }
    
    // Fallback parsing
    return {
      classification: 'safe',
      confidence: 0,
      details: 'Could not parse classification'
    };
  } catch (error) {
    logger.error('Error classifying toxicity:', error);
    return {
      classification: 'safe',
      confidence: 0,
      details: 'Classification failed'
    };
  }
}

/**
 * Detect if a message is a question
 * @param {string} content - Message content
 * @returns {Promise<{isQuestion: boolean, confidence: number, type: string}>}
 */
async function detectQuestion(content) {
  const messages = [
    {
      role: 'system',
      content: 'Detect if the message is a question. Return JSON with: isQuestion (boolean), confidence (0-1), type (informational/help/request/other). Consider context and intent.'
    },
    {
      role: 'user',
      content: content
    }
  ];

  try {
    const result = await callLLMFast(messages, 150);
    
    const match = result.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        isQuestion: parsed.isQuestion || false,
        confidence: parsed.confidence || 0,
        type: parsed.type || 'other'
      };
    }
    
    return {
      isQuestion: false,
      confidence: 0,
      type: 'other'
    };
  } catch (error) {
    logger.error('Error detecting question:', error);
    return {
      isQuestion: false,
      confidence: 0,
      type: 'other'
    };
  }
}

/**
 * Categorize a moderator report
 * @param {string} reason - Report reason
 * @param {string} evidence - Evidence/context
 * @returns {Promise<{category: string, priority: string, summary: string}>}
 */
async function categorizeReport(reason, evidence) {
  const messages = [
    {
      role: 'system',
      content: 'Categorize a moderator report. Return JSON with: category (harassment/spam/rule-violation/other), priority (low/medium/high), summary (brief 1-sentence summary). Be accurate and specific.'
    },
    {
      role: 'user',
      content: `Reason: ${reason}\nEvidence: ${evidence}`
    }
  ];

  try {
    const result = await callLLMFast(messages, 200);
    
    const match = result.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        category: parsed.category || 'other',
        priority: parsed.priority || 'medium',
        summary: parsed.summary || 'Uncategorized report'
      };
    }
    
    return {
      category: 'other',
      priority: 'medium',
      summary: 'Could not categorize'
    };
  } catch (error) {
    logger.error('Error categorizing report:', error);
    return {
      category: 'other',
      priority: 'medium',
      summary: 'Categorization failed'
    };
  }
}

/**
 * Check if toxicity exceeds threshold
 * @param {string} classification - Toxicity classification
 * @param {number} confidence - Confidence score
 * @returns {boolean}
 */
function shouldFlagToxicity(classification, confidence) {
  if (classification === 'high' && confidence > 0.7) return true;
  if (classification === 'medium' && confidence > MOD_SENSITIVITY) return true;
  return false;
}

module.exports = {
  classifyToxicity,
  detectQuestion,
  categorizeReport,
  shouldFlagToxicity
};
