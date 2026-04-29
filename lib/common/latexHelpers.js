/**
 * Wraps display-mode LaTeX in a \begin{split}...\end{split} environment
 * when it contains top-level \\ line breaks that KaTeX would otherwise ignore.
 *
 * @param {string} latex - Raw LaTeX string.
 * @param {boolean} displayMode - Whether this is a display-mode equation.
 * @returns {string} Preprocessed LaTeX string.
 */
function preprocessLatex(latex, displayMode) {
  if (!displayMode) return latex
  const wrapEnvs = /\\begin\{(aligned|split|gathered|array|cases|multline|align)\}/
  if (wrapEnvs.test(latex)) return latex
  if (/\\\\/.test(latex)) return `\\begin{split}${latex}\\end{split}`
  return latex
}

module.exports = { preprocessLatex }
