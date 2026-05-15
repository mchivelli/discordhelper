// Vector embedding pipeline for semantic search
// Uses OpenRouter embeddings API with cached storage in SQLite

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small';

/**
 * Call OpenRouter embedding API. Returns Float32Array.
 * Model: openai/text-embedding-3-small (1536 dimensions)
 * @param {string} text - text to embed (will be truncated to 8000 chars)
 * @returns {Promise<Float32Array>}
 */
async function generateEmbedding(text) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  // Truncate text to avoid token limits
  const truncatedText = text.slice(0, 8000);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: truncatedText
      })
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;
    return new Float32Array(embedding);
  } catch (error) {
    console.error('Embedding generation error:', error.message);
    throw error;
  }
}

/**
 * Cosine similarity between two Float32Arrays
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number} similarity score 0-1
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error('Embedding dimensions must match');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Search message_chunks table for most similar chunks
 * @param {Object} db - better-sqlite3 instance
 * @param {Float32Array} queryEmbedding
 * @param {string} guildId
 * @param {Object} filters - { channelId?, startTs?, endTs?, topK: 10 }
 * @returns {Array<{id, channel_id, start_ts, end_ts, combined_text, similarity, message_count}>}
 */
function searchSimilarChunks(db, queryEmbedding, guildId, filters = {}) {
  const { channelId, startTs, endTs, topK = 10 } = filters;

  let sql = `
    SELECT id, channel_id, start_ts, end_ts, combined_text, embedding, message_count
    FROM message_chunks
    WHERE guild_id = ?
  `;
  const params = [guildId];

  if (channelId) {
    sql += ` AND channel_id = ?`;
    params.push(channelId);
  }

  if (startTs) {
    sql += ` AND start_ts >= ?`;
    params.push(startTs);
  }

  if (endTs) {
    sql += ` AND end_ts <= ?`;
    params.push(endTs);
  }

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);

  // Compute similarity for each row
  const results = rows.map(row => {
    let embedding;
    try {
      // Safely construct Float32Array from Node Buffer (which may be a slice of a pooled ArrayBuffer)
      embedding = new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        row.embedding.byteLength / 4
      );
    } catch (e) {
      console.error('Failed to deserialize embedding:', e);
      return null;
    }

    const similarity = cosineSimilarity(queryEmbedding, embedding);
    return {
      id: row.id,
      channel_id: row.channel_id,
      start_ts: row.start_ts,
      end_ts: row.end_ts,
      combined_text: row.combined_text,
      message_count: row.message_count,
      similarity
    };
  }).filter(r => r !== null);

  // Sort by similarity DESC and return top K
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

/**
 * Group messages into 15-minute windows
 * @param {Array} messages - sorted by timestamp ASC, each has {timestamp, username, content}
 * @returns {Array<{start_ts, end_ts, messages: Array, combined_text: string}>}
 */
function chunkMessages(messages) {
  const chunkWindowMs = 15 * 60 * 1000; // 15 minutes
  const chunks = new Map();

  for (const msg of messages) {
    const chunkKey = Math.floor(msg.timestamp / chunkWindowMs);
    
    if (!chunks.has(chunkKey)) {
      chunks.set(chunkKey, {
        start_ts: chunkKey * chunkWindowMs,
        end_ts: (chunkKey + 1) * chunkWindowMs,
        messages: []
      });
    }
    
    chunks.get(chunkKey).messages.push(msg);
  }

  // Convert to array and build combined_text
  return Array.from(chunks.values()).map(chunk => {
    const combined_text = chunk.messages
      .map(m => `${m.username}: ${m.content}`)
      .join('\n');
    
    return {
      ...chunk,
      combined_text
    };
  });
}

/**
 * Process messages into chunks, generate embeddings, store in DB
 * @param {Object} db
 * @param {string} guildId
 * @param {string} channelId
 * @param {Array} messages - raw messages from chat_messages table
 */
async function processAndStoreChunks(db, guildId, channelId, newMessages) {
  if (!newMessages || newMessages.length === 0) {
    return;
  }

  const chunkWindowMs = 15 * 60 * 1000;

  // Find which 15-min windows were touched by the new messages
  const affectedWindowKeys = new Set();
  for (const msg of newMessages) {
    affectedWindowKeys.add(Math.floor(msg.timestamp / chunkWindowMs));
  }

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO message_chunks
    (id, guild_id, channel_id, start_ts, end_ts, combined_text, embedding, message_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getExisting = db.prepare(`
    SELECT message_count FROM message_chunks
    WHERE guild_id = ? AND channel_id = ? AND start_ts = ?
  `);

  const getWindowMessages = db.prepare(`
    SELECT username, content, timestamp FROM chat_messages
    WHERE guild_id = ? AND channel_id = ? AND timestamp >= ? AND timestamp < ?
    ORDER BY timestamp ASC
  `);

  // Process each affected window: re-fetch full window from DB, only re-embed when message_count changed.
  // Sequential because embedding generation is async — db.transaction() cannot wrap awaits.
  let reembedded = 0;
  let skipped = 0;
  for (const windowKey of affectedWindowKeys) {
    const start_ts = windowKey * chunkWindowMs;
    const end_ts = start_ts + chunkWindowMs;

    const windowMessages = getWindowMessages.all(guildId, channelId, start_ts, end_ts);
    if (windowMessages.length === 0) continue;

    const existing = getExisting.get(guildId, channelId, start_ts);
    if (existing && existing.message_count === windowMessages.length) {
      skipped++;
      continue; // Nothing new in this window since last embed
    }

    const combined_text = windowMessages
      .map(m => `${m.username}: ${m.content}`)
      .join('\n');

    let embedding;
    try {
      embedding = await generateEmbedding(combined_text);
    } catch (e) {
      console.error('Failed to generate embedding for chunk:', e);
      continue;
    }

    const embeddingBuffer = Buffer.from(embedding.buffer);
    const chunkId = `${guildId}-${channelId}-${start_ts}`;

    insertStmt.run(
      chunkId,
      guildId,
      channelId,
      start_ts,
      end_ts,
      combined_text,
      embeddingBuffer,
      windowMessages.length,
      Date.now()
    );
    reembedded++;
  }

  if (reembedded > 0 || skipped > 0) {
    console.log(`[embeddings] channel ${channelId}: ${reembedded} chunks embedded, ${skipped} up-to-date`);
  }
}

module.exports = {
  generateEmbedding,
  cosineSimilarity,
  searchSimilarChunks,
  chunkMessages,
  processAndStoreChunks
};
