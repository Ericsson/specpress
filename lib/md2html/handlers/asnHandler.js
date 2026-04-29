/**
 * Extracts the first identifier (word) from ASN.1 source text, which is
 * typically the module name (e.g. "NR-RRC-Definitions"). Skips blank
 * lines, line comments (--), and text inside block comments.
 *
 * @param {string} content - Raw ASN.1 source text.
 * @returns {string|null} The first identifier, or null if none found.
 */
function extractFirstAsnWord(content) {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    const blockCommentStart = trimmed.indexOf('/*');
    const textBeforeComment = blockCommentStart !== -1 ? trimmed.substring(0, blockCommentStart) : trimmed;
    const match = textBeforeComment.match(/\b([a-zA-Z][a-zA-Z0-9-]*)\b/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Extracts leading comment lines from the top of an ASN.1 file.
 *
 * Collects consecutive line comments (-- ...) and block comments
 * (/* ... *\/), stopping at the first non-comment, non-blank line.
 * Returns both the collected comment strings and the remaining
 * ASN.1 content after the comments.
 *
 * @param {string} content - Raw ASN.1 source text.
 * @returns {{ comments: string[], remainingContent: string }}
 *   comments — array of extracted comment text strings (without markers).
 *   remainingContent — the ASN.1 source after the leading comments.
 */
function extractAsnLeadingComments(content) {
  const lines = content.split('\n');
  const comments = [];
  let i = 0;
  let inBlockComment = false;
  let blockCommentText = [];

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed && !inBlockComment) {
      i++;
      continue;
    }

    if (inBlockComment) {
      const endIdx = lines[i].indexOf('*/');
      if (endIdx !== -1) {
        blockCommentText.push(lines[i].substring(0, endIdx).trim());
        comments.push(blockCommentText.filter(t => t).join(' '));
        blockCommentText = [];
        inBlockComment = false;
      } else {
        blockCommentText.push(lines[i].trim());
      }
      i++;
    } else if (trimmed.startsWith('/*')) {
      const endIdx = lines[i].indexOf('*/');
      if (endIdx !== -1) {
        const commentContent = lines[i].substring(lines[i].indexOf('/*') + 2, endIdx).trim();
        if (commentContent) comments.push(commentContent);
      } else {
        blockCommentText.push(lines[i].substring(lines[i].indexOf('/*') + 2).trim());
        inBlockComment = true;
      }
      i++;
    } else if (trimmed.startsWith('--')) {
      comments.push(trimmed.substring(2).trim());
      i++;
    } else {
      break;
    }
  }

  const remainingContent = lines.slice(i).join('\n');
  return { comments, remainingContent };
}

/**
 * Wraps each line of highlighted ASN.1 HTML in a <span> with a hanging
 * indent class based on the leading whitespace. Indentation is measured
 * in multiples of 4 spaces, capped at level 6.
 *
 * @param {string} html - Already-highlighted ASN.1 HTML string.
 * @returns {string} HTML with each line wrapped in a hang-class span.
 */
function applyHangingIndent(html) {
  return html.split('\n').map(line => {
    if (!line) return line
    const leadingSpaces = line.match(/^( *)/)[1].length
    const level = Math.min(Math.floor(leadingSpaces / 4), 6)
    return `<span class="hang${level}">${line.substring(leadingSpaces)}</span>`
  }).join('\n')
}

/**
 * Applies syntax highlighting to ASN.1 source code for HTML rendering.
 *
 * Processing steps:
 * 1. HTML-escape the source (&, <, >).
 * 2. Wrap block comments (/* ... *\/) in asn-comment spans.
 * 3. For each line, wrap line comments (-- ...) in asn-comment spans.
 * 4. Tokenise non-comment text and wrap identifiers by category:
 *    - ASN.1 keywords → asn-keyword
 *    - Uppercase-initial words (type names) → asn-type
 *    - Lowercase-initial words (field names) → asn-field
 * 5. Apply hanging-indent spans based on leading whitespace.
 *
 * @param {string} code - Raw ASN.1 source text.
 * @returns {string} HTML string with syntax-highlighting spans.
 */

/**
 * Renders inline markdown bold/italic within ASN.1 comment text.
 *
 * Uses markdown-it's inline parser for correct handling of nested
 * bold/italic, consistent with the DOCX output.
 *
 * @param {string} text - Comment text (may include -- or /* markers).
 * @returns {string} HTML with bold/italic tags.
 */
function renderCommentMarkdown(text) {
  if (!renderCommentMarkdown._md) {
    renderCommentMarkdown._md = new (require('markdown-it'))({ html: true })
  }
  const md = renderCommentMarkdown._md
  // Render through markdown-it and strip the wrapping <p> tags
  const rendered = md.renderInline(text)
  return rendered
}

function highlightAsn(code) {
  const keywords = ['DEFINITIONS', 'AUTOMATIC', 'TAGS', 'BEGIN', 'END', 'IMPORTS', 'EXPORTS', 'OPTIONAL', 'DEFAULT', 'SIZE', 'CONTAINING', 'INTEGER', 'NULL', 'SEQUENCE', 'BOOLEAN', 'ENUMERATED', 'SET', 'CHOICE', 'OF', 'FROM'];
  const multiWordKeywords = ['OCTET STRING', 'BIT STRING'];

  // Escape HTML first
  let result = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Handle block comments first (/* ... */)
  result = result.replace(/\/\*[\s\S]*?\*\//g, match => `<span class="asn-comment">${renderCommentMarkdown(match)}</span>`);

  // Split by lines to handle line comments
  const lines = result.split('\n');
  const processedLines = lines.map(line => {
    // Skip if line is already inside a block comment span
    if (line.includes('<span class="asn-comment">')) {
      return line;
    }

    // Check if line contains a line comment
    const commentIndex = line.indexOf('--');
    if (commentIndex !== -1) {
      const beforeComment = line.substring(0, commentIndex);
      const comment = line.substring(commentIndex);
      return highlightLine(beforeComment) + `<span class="asn-comment">${renderCommentMarkdown(comment)}</span>`;
    }
    return highlightLine(line);
  });

  return applyHangingIndent(processedLines.join('\n'));

  /**
   * Highlights a single line of HTML-escaped ASN.1 text (excluding comments)
   * by wrapping keywords, type names, and field names in CSS-class spans.
   *
   * @param {string} line - A single HTML-escaped line without comment markers.
   * @returns {string} The line with identifier spans inserted.
   */
  function highlightLine(line) {
    const tokens = [];
    let currentPos = 0;

    // Match all words (alphanumeric with hyphens)
    const wordRegex = /\b([a-zA-Z][a-zA-Z0-9-]*)\b/g;
    let match;

    while ((match = wordRegex.exec(line)) !== null) {
      // Add text before the match
      if (match.index > currentPos) {
        tokens.push(line.substring(currentPos, match.index));
      }

      const word = match[1];

      // Check for multi-word keywords by looking ahead
      let multiMatch = false;
      for (const mw of multiWordKeywords) {
        if (line.substring(match.index, match.index + mw.length) === mw) {
          tokens.push(`<span class="asn-keyword">${mw}</span>`);
          currentPos = match.index + mw.length;
          wordRegex.lastIndex = currentPos;
          multiMatch = true;
          break;
        }
      }
      if (multiMatch) continue;

      // Determine the type and wrap accordingly
      if (keywords.includes(word)) {
        tokens.push(`<span class="asn-keyword">${word}</span>`);
      } else if (/^[A-Z]/.test(word)) {
        tokens.push(`<span class="asn-type">${word}</span>`);
      } else if (/^[a-z]/.test(word)) {
        tokens.push(`<span class="asn-field">${word}</span>`);
      } else {
        tokens.push(word);
      }

      currentPos = match.index + word.length;
    }

    // Add remaining text
    if (currentPos < line.length) {
      tokens.push(line.substring(currentPos));
    }

    return tokens.join('');
  }
}

/**
 * Converts ASN.1 source text to markdown by extracting leading comments and
 * module name, then wrapping the remaining content in a fenced code block.
 *
 * When specRootPath and filePath are provided, the heading level and
 * x-placeholder are derived from the file path so that section number
 * injection works correctly.
 *
 * @param {string} content - Raw ASN.1 source text.
 * @param {string} [specRootPath=''] - Specification root for deriving heading level.
 * @param {string} [filePath=''] - Absolute path to the ASN file.
 * @returns {string} Markdown representation of the ASN.1 content.
 */
function asnToMarkdown(content, specRootPath, filePath) {
  const { comments, remainingContent } = extractAsnLeadingComments(content)
  const firstWord = extractFirstAsnWord(content)

  let heading = ''
  if (firstWord) {
    let hashes = '####'
    let placeholder = ''
    if (specRootPath && filePath) {
      const { extractSectionNumber } = require('../../common/specProcessor')
      const { sectionNumber } = extractSectionNumber(filePath, specRootPath)
      if (sectionNumber) {
        const level = sectionNumber.split('.').length
        hashes = '#'.repeat(level)
        placeholder = Array(level).fill('x').join('.') + ' '
      }
    }
    heading = `${hashes} ${placeholder}ASN.1 Module: ${firstWord}\n\n`
  }

  const commentParagraphs = comments.length > 0 ? comments.join('\n\n') + '\n\n' : ''
  return heading + commentParagraphs + '```asn\n' + remainingContent + '\n```'
}

module.exports = { highlightAsn, extractFirstAsnWord, extractAsnLeadingComments, asnToMarkdown }
