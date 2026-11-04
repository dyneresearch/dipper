import { estimateTokens, estimateCost, formatNumber } from './utils.js';

/**
 * Generate the complete architectural blueprint markdown
 */
export function buildBlueprint({ files, parsedFiles, totalRawTokens, rootDirectory }) {
  const symbolIndex = new Map(); // symbolId -> symbol object
  const fileMap = new Map();     // relativePath -> parsedFile

  parsedFiles.forEach((pf) => {
    fileMap.set(pf.relativePath, pf);
    pf.symbols.forEach((sym) => {
      symbolIndex.set(sym.id, { ...sym, relativePath: pf.relativePath });
    });
  });

  // Build the markdown wireframe
  const mdSections = [];

  // Header and Agent Instruction Protocol
  mdSections.push(`# ARCHITECTURAL BLUEPRINT (DIPPER PROTOCOL)
> **Agent Instructions:**
> 1. This is a compressed structural wireframe of the repository. Implementation bodies have been stripped to preserve context window.
> 2. Each symbol has a canonical ID: \`<file_path>#<symbol_name>\`.
> 3. To inspect the full implementation of any symbol, invoke the \`dip(symbol_id)\` tool or read the corresponding lines.
`);

  // Section 1: File Topology & Dependency Graph
  mdSections.push(`## 1. REPOSITORY TOPOLOGY & DEPENDENCIES\n`);
  
  // Dependency connections
  const dependencyLines = [];
  parsedFiles.forEach((pf) => {
    if (pf.imports.length > 0) {
      const internalImports = pf.imports
        .filter((imp) => !imp.isExternal)
        .map((imp) => imp.source)
        .join(', ');
      const externalImports = pf.imports
        .filter((imp) => imp.isExternal)
        .map((imp) => imp.source)
        .slice(0, 5)
        .join(', ');

      let line = `- **\`${pf.relativePath}\`**`;
      if (internalImports) line += ` ──> internal: [${internalImports}]`;
      if (externalImports) line += ` | external: [${externalImports}]`;
      dependencyLines.push(line);
    }
  });

  if (dependencyLines.length > 0) {
    mdSections.push(dependencyLines.join('\n') + '\n');
  } else {
    mdSections.push(`- No inter-file dependencies detected.\n`);
  }

  // Section 2: Symbol Signatures & Interfaces
  mdSections.push(`## 2. MODULE SIGNATURES & SYMBOLS\n`);

  parsedFiles.forEach((pf) => {
    if (pf.symbols.length === 0 && !pf.moduleDoc) return;

    mdSections.push(`### \`${pf.relativePath}\` (${pf.language})`);
    if (pf.moduleDoc) {
      mdSections.push(`> *${pf.moduleDoc}*\n`);
    }

    if (pf.symbols.length > 0) {
      mdSections.push('```' + (pf.language.includes('python') ? 'python' : 'typescript'));
      pf.symbols.forEach((sym) => {
        const docComment = sym.doc ? `  // ${sym.doc}\n` : '';
        const exportPrefix = sym.isExported ? '' : '// [internal] ';
        mdSections.push(`${docComment}  ${exportPrefix}${sym.signature}  [#dip: ${sym.id} (L${sym.startLine}-L${sym.endLine})]`);
      });
      mdSections.push('```\n');
    } else {
      mdSections.push(`*(No exported functions or classes detected)*\n`);
    }
  });

  const fullMarkdown = mdSections.join('\n');
  const blueprintTokens = estimateTokens(fullMarkdown);
  const savingsTokens = Math.max(0, totalRawTokens - blueprintTokens);
  const savingsPercent = totalRawTokens > 0 ? (savingsTokens / totalRawTokens) * 100 : 0;

  return {
    markdown: fullMarkdown,
    symbolIndex,
    fileMap,
    metrics: {
      totalFiles: files.length,
      totalSymbols: symbolIndex.size,
      rawTokens: totalRawTokens,
      blueprintTokens,
      savingsTokens,
      savingsPercent,
      rawCost: estimateCost(totalRawTokens),
      blueprintCost: estimateCost(blueprintTokens),
    },
  };
}

/**
 * Return JSON representation of the blueprint
 */
export function buildJsonBlueprint(blueprintResult) {
  const symbols = [];
  blueprintResult.symbolIndex.forEach((v) => symbols.push(v));

  return {
    version: '1.0.0',
    metrics: blueprintResult.metrics,
    symbols,
  };
}

