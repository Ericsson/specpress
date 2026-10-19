/**
 * Line-ending normalization for export.
 *
 * Cached diagram SVGs and other text files can end up with CRLF line endings
 * for reasons outside SpecPress's control: some renderers (e.g. MSC-Gen on
 * certain platforms) emit CRLF natively, and `git archive` — used by
 * `FileResolver` to unpack a git commit for DOCX/HTML diff export — does not
 * reliably apply the same line-ending conversion as a normal `git checkout`,
 * so the same committed file can read back with different bytes depending on
 * how it was obtained. None of this is something the user can fix after the
 * fact (old commits are immutable, and a native renderer's line-ending choice
 * isn't configurable), so rather than warn about it, this module normalizes
 * silently: downstream consumers (and the DOCX/HTML diff comparison) always
 * see LF-only content regardless of how the bytes landed on disk.
 */

/**
 * Replaces CRLF ("\r\n") with LF ("\n") in a text string.
 *
 * @param {string} content - Text content to normalize.
 * @returns {string} Content with LF-only line endings.
 */
function normalizeCrlf(content) {
  return typeof content === 'string' ? content.replace(/\r\n/g, '\n') : content
}

/**
 * File extensions (lowercase, without the dot) treated as text for the
 * purposes of CRLF normalization when unpacking a git commit.
 */
const TEXT_FILE_EXTENSIONS = new Set(['md', 'markdown', 'asn', 'asn1', 'json', 'svg', 'txt', 'css'])

/**
 * Whether a file path has an extension recognized as text for CRLF
 * normalization purposes.
 *
 * @param {string} filePath - File path (absolute or relative).
 * @returns {boolean}
 */
function isNormalizableTextFile(filePath) {
  const m = /\.([^.\\/]+)$/.exec(filePath)
  return !!m && TEXT_FILE_EXTENSIONS.has(m[1].toLowerCase())
}

module.exports = { normalizeCrlf, isNormalizableTextFile, TEXT_FILE_EXTENSIONS }
