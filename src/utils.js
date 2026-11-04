import path from 'node:path';

/**
 * ANSI Color helpers (Zero external dependencies)
 */
export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  
  bgBlue: '\x1b[44m',
  bgCyan: '\x1b[46m',
};

export const c = {
  bold: (s) => `${colors.bold}${s}${colors.reset}`,
  dim: (s) => `${colors.dim}${s}${colors.reset}`,
  cyan: (s) => `${colors.cyan}${s}${colors.reset}`,
  green: (s) => `${colors.green}${s}${colors.reset}`,
  yellow: (s) => `${colors.yellow}${s}${colors.reset}`,
  red: (s) => `${colors.red}${s}${colors.reset}`,
  magenta: (s) => `${colors.magenta}${s}${colors.reset}`,
  gray: (s) => `${colors.gray}${s}${colors.reset}`,
  blue: (s) => `${colors.blue}${s}${colors.reset}`,
};

/**
 * Approximate token count for code and text.
 * Accurately calibrated against BPE tokenizers (tiktoken cl100k and Claude) which average ~3.7 chars/token for code.
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const wordsAndPunct = text.match(/\w+|[^\w\s]/g);
  if (!wordsAndPunct) return Math.ceil(text.length / 4);

  const countFromChunks = wordsAndPunct.reduce((acc, word) => {
    return acc + (word.length > 8 ? Math.ceil(word.length / 4) : 1);
  }, 0);

  const countFromChars = Math.ceil(text.length / 3.7);
  return Math.max(1, Math.round((countFromChunks + countFromChars) / 2));
}

/**
 * Estimate cost in USD for Claude 3.5 Sonnet / GPT-4o input tier (~$3.00 / 1M tokens)
 */
export function estimateCost(tokens, costPerMillion = 3.0) {
  return ((tokens / 1_000_000) * costPerMillion).toFixed(4);
}

/**
 * Format bytes to readable string (e.g. 1.2 MB)
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format integer with commas (e.g. 184,200)
 */
export function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Normalize file path to forward slashes for consistent symbol IDs
 */
export function normalizePath(p) {
  return p.split(path.sep).join('/');
}

/**
 * Render terminal statistics card (Viral shareable ASCII card)
 */
export function renderStatsCard({
  repoName,
  fileCount,
  rawTokens,
  blueprintTokens,
  savingsPercent,
  rawCost,
  blueprintCost,
}) {
  const line = '─'.repeat(58);
  const card = [
    `\n${c.cyan('┌' + line + '┐')}`,
    `${c.cyan('│')}  ${c.bold('DIPPER')} ${c.gray('• The Agentic Context-Dipper')}                ${c.cyan('│')}`,
    `${c.cyan('├' + line + '┤')}`,
    `${c.cyan('│')}  Repository:       ${c.bold(repoName.padEnd(38))} ${c.cyan('│')}`,
    `${c.cyan('│')}  Files Indexed:    ${formatNumber(fileCount).padEnd(38)} ${c.cyan('│')}`,
    `${c.cyan('├' + line + '┤')}`,
    `${c.cyan('│')}  Raw Codebase:     ${(formatNumber(rawTokens) + ' tokens (~$' + rawCost + '/prompt)').padEnd(38)} ${c.cyan('│')}`,
    `${c.cyan('│')}  Dipper Blueprint: ${c.green((formatNumber(blueprintTokens) + ' tokens (~$' + blueprintCost + '/prompt)').padEnd(38))} ${c.cyan('│')}`,
    `${c.cyan('│')}  Context Savings:  ${c.bold(c.green(('⚡ -' + savingsPercent.toFixed(1) + '% reduction')).padEnd(38))} ${c.cyan('│')}`,
    `${c.cyan('└' + line + '┘')}\n`,
  ].join('\n');

  return card;
}
