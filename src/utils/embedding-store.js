/**
 * Binary embedding storage.
 *
 * file-db.js stores rows as JSON, which is not suitable for Float32Array
 * embeddings (1536 floats × 4 bytes = 6 KB per chunk; JSON-serializing a
 * Float32Array balloons to ~30 KB and corrupts the byte layout). This
 * module persists embeddings as raw .bin files keyed by chunk id.
 *
 * Layout: <DB_ROOT>/embeddings/<chunk_id>.bin
 *
 * The chunk_id used by message_chunks is `${guild_id}-${channel_id}-${start_ts}`
 * which is filesystem-safe (only digits and dashes).
 */
const fs = require('fs-extra');
const path = require('path');

const DB_ROOT = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(process.cwd(), 'data');

const EMBED_DIR = path.join(DB_ROOT, 'embeddings');
fs.ensureDirSync(EMBED_DIR);

function safePath(chunkId) {
  // Defensive: strip any chars that aren't safe on disk (.,/,\,etc).
  const safe = String(chunkId).replace(/[^A-Za-z0-9_\-]/g, '_');
  return path.join(EMBED_DIR, `${safe}.bin`);
}

/**
 * Persist a Float32Array embedding to disk.
 * @param {string} chunkId
 * @param {Float32Array} embedding
 */
function writeEmbedding(chunkId, embedding) {
  if (!(embedding instanceof Float32Array)) {
    throw new TypeError('writeEmbedding requires a Float32Array');
  }
  const buf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  fs.writeFileSync(safePath(chunkId), buf);
}

/**
 * Read a previously-persisted embedding back as a Float32Array.
 * Returns null if the file does not exist.
 * @param {string} chunkId
 * @returns {Float32Array|null}
 */
function readEmbedding(chunkId) {
  const p = safePath(chunkId);
  if (!fs.existsSync(p)) return null;
  const buf = fs.readFileSync(p);
  // Safe Float32Array view honoring buffer slicing semantics.
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/**
 * Delete an embedding file if it exists.
 * @param {string} chunkId
 * @returns {boolean} true if a file was deleted, false otherwise
 */
function deleteEmbedding(chunkId) {
  const p = safePath(chunkId);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    return true;
  }
  return false;
}

/**
 * @param {string} chunkId
 * @returns {boolean}
 */
function exists(chunkId) {
  return fs.existsSync(safePath(chunkId));
}

module.exports = {
  writeEmbedding,
  readEmbedding,
  deleteEmbedding,
  exists,
  EMBED_DIR
};
