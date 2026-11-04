import path from 'node:path';

/**
 * Result of parsing a single file into a structural skeleton
 */
export class FileBlueprint {
  constructor(relativePath, language) {
    this.relativePath = relativePath;
    this.language = language;
    this.moduleDoc = null;
    this.imports = [];       // { source, symbols, isExternal }
    this.symbols = [];       // { id, name, kind, signature, doc, startLine, endLine, isExported }
    this.skeletonText = '';
  }
}

/**
 * Clean and truncate docstring/comment to keep it tight
 */
function cleanDoc(comment) {
  if (!comment) return null;
  const lines = comment
    .replace(/^\/\*\*?|\*\/$/g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?|^\s*#\s?|^\s*\/\/\s?/, '').trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return lines.slice(0, 3).join(' ');
}

/**
 * Extracts balanced parentheses starting from an opening '(' index
 */
function extractBalancedParens(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') {
      depth--;
      if (depth === 0) {
        return { content: str.slice(openIdx + 1, i), closeIdx: i };
      }
    }
  }
  return null;
}

/**
 * Parses JavaScript and TypeScript files
 */
function parseJavaScriptOrTypeScript(content, relPath) {
  const blueprint = new FileBlueprint(relPath, 'javascript/typescript');
  const lines = content.split('\n');

  let pendingDoc = null;
  let inBlockComment = false;
  let blockCommentLines = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    const lineNum = i + 1;

    // Comments & JSDoc handling
    if (line.startsWith('/*')) {
      inBlockComment = true;
      blockCommentLines = [line];
      if (line.endsWith('*/') && line.length > 4) {
        inBlockComment = false;
        pendingDoc = cleanDoc(blockCommentLines.join('\n'));
      }
      continue;
    }
    if (inBlockComment) {
      blockCommentLines.push(line);
      if (line.includes('*/')) {
        inBlockComment = false;
        pendingDoc = cleanDoc(blockCommentLines.join('\n'));
      }
      continue;
    }
    if (line.startsWith('//')) {
      if (!pendingDoc) pendingDoc = cleanDoc(line);
      continue;
    }

    // Top-of-file docstring detection
    if (i < 5 && pendingDoc && !blueprint.moduleDoc && !line.startsWith('import') && !line.startsWith('export')) {
      blueprint.moduleDoc = pendingDoc;
      pendingDoc = null;
    }

    // Imports: e.g. import { x, y } from './path' or import x from 'pkg'
    const importMatch = line.match(/^import\s+(?:type\s+)?(?:([\w*\s{},]+)\s+from\s+)?['"]([^'"]+)['"]/);
    if (importMatch) {
      const symbolsStr = importMatch[1] || '';
      const source = importMatch[2];
      const isExternal = !source.startsWith('.') && !source.startsWith('/');
      const symbols = symbolsStr
        .replace(/[{}]/g, '')
        .split(',')
        .map((s) => s.trim().split(/\s+as\s+/)[0])
        .filter(Boolean);

      blueprint.imports.push({ source, symbols, isExternal, line: lineNum });
      pendingDoc = null;
      continue;
    }

    // Require / CommonJS imports
    const requireMatch = line.match(/(?:const|let|var)\s+([\w\s{},]+)\s*=\s*require\(['"]([^'"]+)['"]\)/);
    if (requireMatch) {
      const symbolsStr = requireMatch[1];
      const source = requireMatch[2];
      const isExternal = !source.startsWith('.') && !source.startsWith('/');
      blueprint.imports.push({
        source,
        symbols: symbolsStr.replace(/[{}]/g, '').split(',').map((s) => s.trim()).filter(Boolean),
        isExternal,
        line: lineNum,
      });
      pendingDoc = null;
      continue;
    }

    const isExported = line.startsWith('export ') || line.startsWith('export default ');

    // Class definition: (export)? (default)? (abstract)? class Name (extends Foo)? (implements Bar)?
    const classMatch = line.match(/^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+([\w.]+))?(?:\s+implements\s+([\w\s,]+))?/);
    if (classMatch) {
      const name = classMatch[1];
      const extendsClass = classMatch[2] ? ` extends ${classMatch[2]}` : '';
      const implementsList = classMatch[3] ? ` implements ${classMatch[3].trim()}` : '';
      blueprint.symbols.push({
        id: `${relPath}#${name}`,
        name,
        kind: 'class',
        signature: `class ${name}${extendsClass}${implementsList}`,
        doc: pendingDoc,
        startLine: lineNum,
        endLine: findBlockEnd(lines, i),
        isExported,
      });
      pendingDoc = null;
      continue;
    }

    // Interface definition (TS): (export)? interface Name (extends Foo)?
    const interfaceMatch = line.match(/^(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([\w\s,]+))?/);
    if (interfaceMatch) {
      const name = interfaceMatch[1];
      const extendsList = interfaceMatch[2] ? ` extends ${interfaceMatch[2].trim()}` : '';
      blueprint.symbols.push({
        id: `${relPath}#${name}`,
        name,
        kind: 'interface',
        signature: `interface ${name}${extendsList}`,
        doc: pendingDoc,
        startLine: lineNum,
        endLine: findBlockEnd(lines, i),
        isExported,
      });
      pendingDoc = null;
      continue;
    }

    // Type definition (TS): (export)? type Name = ...
    const typeMatch = line.match(/^(?:export\s+)?type\s+(\w+)(?:<[^>]+>)?\s*=/);
    if (typeMatch) {
      const name = typeMatch[1];
      blueprint.symbols.push({
        id: `${relPath}#${name}`,
        name,
        kind: 'type',
        signature: line.replace(/^export\s+/, ''),
        doc: pendingDoc,
        startLine: lineNum,
        endLine: lineNum,
        isExported,
      });
      pendingDoc = null;
      continue;
    }

    // Function declaration: (export)? (async)? function name(...)
    const funcMatch = line.match(/^(?:export\s+(?:default\s+)?)?(async\s+)?function(?:\s*\*)?\s*(\w+)?\s*\(/);
    if (funcMatch) {
      const isAsync = funcMatch[1] ? 'async ' : '';
      const name = funcMatch[2] || 'anonymous';
      const openParenIdx = line.indexOf('(', funcMatch[0].length - 1);
      const parenResult = extractBalancedParens(line, openParenIdx);
      const params = parenResult ? cleanParams(parenResult.content) : '';
      const after = parenResult ? line.slice(parenResult.closeIdx + 1) : '';
      const returnMatch = after.match(/^\s*:\s*([^;{]+)/);
      const returnType = returnMatch ? `: ${returnMatch[1].trim()}` : '';

      blueprint.symbols.push({
        id: `${relPath}#${name}`,
        name,
        kind: 'function',
        signature: `${isAsync}function ${name}(${params})${returnType}`,
        doc: pendingDoc,
        startLine: lineNum,
        endLine: findBlockEnd(lines, i),
        isExported,
      });
      pendingDoc = null;
      continue;
    }

    // Arrow functions & methods: (export)? const foo = (async)? (...) => ...
    const arrowMatch = line.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(/);
    if (arrowMatch) {
      const name = arrowMatch[1];
      const isAsync = arrowMatch[2] ? 'async ' : '';
      const openParenIdx = line.indexOf('(', arrowMatch[0].length - 1);
      const parenResult = extractBalancedParens(line, openParenIdx);
      if (parenResult) {
        const after = line.slice(parenResult.closeIdx + 1);
        if (after.includes('=>')) {
          const params = cleanParams(parenResult.content);
          const returnMatch = after.match(/^\s*:\s*([^=>]+)\s*=>/);
          const returnType = returnMatch ? `: ${returnMatch[1].trim()}` : '';
          blueprint.symbols.push({
            id: `${relPath}#${name}`,
            name,
            kind: 'function',
            signature: `const ${name} = ${isAsync}(${params})${returnType} => { ... }`,
            doc: pendingDoc,
            startLine: lineNum,
            endLine: findBlockEnd(lines, i),
            isExported,
          });
          pendingDoc = null;
          continue;
        }
      }
    }

    // Express / API routes: router.get('/users', ...) or app.post(...)
    const routeMatch = line.match(/^(?:export\s+)?(?:app|router|server)\.(get|post|put|delete|patch|options|head)\(\s*['"]([^'"]+)['"]/);
    if (routeMatch) {
      const method = routeMatch[1].toUpperCase();
      const endpoint = routeMatch[2];
      blueprint.symbols.push({
        id: `${relPath}#route:${method}:${endpoint}`,
        name: `${method} ${endpoint}`,
        kind: 'route',
        signature: `${method} ${endpoint}`,
        doc: pendingDoc,
        startLine: lineNum,
        endLine: findBlockEnd(lines, i),
        isExported: true,
      });
      pendingDoc = null;
      continue;
    }

    // Reset pending doc if we passed whitespace or non-matching code
    if (line !== '') {
      pendingDoc = null;
    }
  }

  return blueprint;
}

/**
 * Parses Python files
 */
function parsePython(content, relPath) {
  const blueprint = new FileBlueprint(relPath, 'python');
  const lines = content.split('\n');

  let pendingDoc = null;
  let inDocstring = false;
  let docstringQuote = null;
  let docstringLines = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    const lineNum = i + 1;

    // Docstrings (""" or ''')
    if (line.startsWith('"""') || line.startsWith("'''")) {
      const quote = line.slice(0, 3);
      if (line.endsWith(quote) && line.length > 5) {
        pendingDoc = cleanDoc(line.slice(3, -3));
        if (i < 5 && !blueprint.moduleDoc) {
          blueprint.moduleDoc = pendingDoc;
          pendingDoc = null;
        }
      } else {
        inDocstring = true;
        docstringQuote = quote;
        docstringLines = [line.slice(3)];
      }
      continue;
    }

    if (inDocstring) {
      if (line.endsWith(docstringQuote)) {
        inDocstring = false;
        docstringLines.push(line.slice(0, -3));
        pendingDoc = cleanDoc(docstringLines.join('\n'));
        if (i < 10 && !blueprint.moduleDoc) {
          blueprint.moduleDoc = pendingDoc;
          pendingDoc = null;
        }
      } else {
        docstringLines.push(line);
      }
      continue;
    }

    // Python comments
    if (line.startsWith('#')) {
      if (!pendingDoc) pendingDoc = cleanDoc(line);
      continue;
    }

    // Imports
    const importMatch = line.match(/^(?:from\s+([\w.]+)\s+)?import\s+([\w*,\s]+)/);
    if (importMatch) {
      const fromModule = importMatch[1] || '';
      const symbols = importMatch[2].split(',').map((s) => s.trim()).filter(Boolean);
      const isExternal = !fromModule.startsWith('.');
      blueprint.imports.push({
        source: fromModule || symbols[0],
        symbols,
        isExternal,
        line: lineNum,
      });
      pendingDoc = null;
      continue;
    }

    // Classes: class Name(Base):
    const classMatch = line.match(/^class\s+(\w+)(?:\(([^)]*)\))?:/);
    if (classMatch) {
      const name = classMatch[1];
      const base = classMatch[2] ? `(${classMatch[2]})` : '';
      blueprint.symbols.push({
        id: `${relPath}#${name}`,
        name,
        kind: 'class',
        signature: `class ${name}${base}:`,
        doc: pendingDoc,
        startLine: lineNum,
        endLine: findPythonBlockEnd(lines, i),
        isExported: !name.startsWith('_'),
      });
      pendingDoc = null;
      continue;
    }

    // Functions: (async)? def name(params) -> return:
    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/);
    if (funcMatch) {
      const name = funcMatch[1];
      const params = cleanParams(funcMatch[2] || '');
      const returnType = funcMatch[3] ? ` -> ${funcMatch[3].trim()}` : '';
      blueprint.symbols.push({
        id: `${relPath}#${name}`,
        name,
        kind: 'function',
        signature: `def ${name}(${params})${returnType}:`,
        doc: pendingDoc,
        startLine: lineNum,
        endLine: findPythonBlockEnd(lines, i),
        isExported: !name.startsWith('_'),
      });
      pendingDoc = null;
      continue;
    }

    // FastAPI / Flask Route Decorators: @app.get("/path")
    const routeMatch = line.match(/^@(?:app|router)\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/);
    if (routeMatch) {
      const method = routeMatch[1].toUpperCase();
      const endpoint = routeMatch[2];
      blueprint.symbols.push({
        id: `${relPath}#route:${method}:${endpoint}`,
        name: `${method} ${endpoint}`,
        kind: 'route',
        signature: `@app.${routeMatch[1]}("${endpoint}")`,
        doc: pendingDoc,
        startLine: lineNum,
        endLine: findPythonBlockEnd(lines, i),
        isExported: true,
      });
      pendingDoc = null;
      continue;
    }

    if (line !== '') pendingDoc = null;
  }

  return blueprint;
}

/**
 * Parses Go files
 */
function parseGo(content, relPath) {
  const blueprint = new FileBlueprint(relPath, 'go');
  const lines = content.split('\n');
  let pendingDoc = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    if (line.startsWith('//')) {
      if (!pendingDoc) pendingDoc = cleanDoc(line);
      continue;
    }

    // Funcs: func (r *Receiver) Method(args) Return { ... }
    const funcMatch = line.match(/^func\s+(?:\(([^)]+)\)\s+)?([A-Z]\w*|\w+)\s*\(([^)]*)\)(?:\s*(.+?))?\s*\{/);
    if (funcMatch) {
      const receiver = funcMatch[1] ? `(${funcMatch[1]}) ` : '';
      const name = funcMatch[2];
      const params = cleanParams(funcMatch[3] || '');
      const ret = funcMatch[4] ? ` ${funcMatch[4].trim()}` : '';
      const isExported = /^[A-Z]/.test(name);

      blueprint.symbols.push({
        id: `${relPath}#${name}`,
        name,
        kind: 'function',
        signature: `func ${receiver}${name}(${params})${ret}`,
        doc: pendingDoc,
        startLine: lineNum,
        endLine: findBlockEnd(lines, i),
        isExported,
      });
      pendingDoc = null;
      continue;
    }

    // Structs / Interfaces: type Name struct / interface
    const typeMatch = line.match(/^type\s+([A-Z]\w*|\w+)\s+(struct|interface)/);
    if (typeMatch) {
      const name = typeMatch[1];
      const kind = typeMatch[2];
      blueprint.symbols.push({
        id: `${relPath}#${name}`,
        name,
        kind,
        signature: `type ${name} ${kind}`,
        doc: pendingDoc,
        startLine: lineNum,
        endLine: findBlockEnd(lines, i),
        isExported: /^[A-Z]/.test(name),
      });
      pendingDoc = null;
      continue;
    }

    if (line !== '') pendingDoc = null;
  }

  return blueprint;
}

/**
 * Parses Rust files
 */
function parseRust(content, relPath) {
  const blueprint = new FileBlueprint(relPath, 'rust');
  const lines = content.split('\n');
  let pendingDoc = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    if (line.startsWith('///') || line.startsWith('//')) {
      if (!pendingDoc) pendingDoc = cleanDoc(line);
      continue;
    }

    // Functions: (pub)? (async)? fn name(...) -> Return
    const fnMatch = line.match(/^(?:(pub(?:\([^)]+\))?)\s+)?(async\s+)?fn\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)(?:\s*->\s*([^{]+))?/);
    if (fnMatch) {
      const isPub = fnMatch[1] || '';
      const isAsync = fnMatch[2] || '';
      const name = fnMatch[3];
      const params = cleanParams(fnMatch[4] || '');
      const ret = fnMatch[5] ? ` -> ${fnMatch[5].trim()}` : '';

      blueprint.symbols.push({
        id: `${relPath}#${name}`,
        name,
        kind: 'function',
        signature: `${isPub ? isPub + ' ' : ''}${isAsync}fn ${name}(${params})${ret}`,
        doc: pendingDoc,
        startLine: lineNum,
        endLine: findBlockEnd(lines, i),
        isExported: !!isPub,
      });
      pendingDoc = null;
      continue;
    }

    // Struct / Enum / Trait
    const typeMatch = line.match(/^(?:(pub(?:\([^)]+\))?)\s+)?(struct|enum|trait)\s+(\w+)/);
    if (typeMatch) {
      const isPub = typeMatch[1] || '';
      const kind = typeMatch[2];
      const name = typeMatch[3];
      blueprint.symbols.push({
        id: `${relPath}#${name}`,
        name,
        kind,
        signature: `${isPub ? isPub + ' ' : ''}${kind} ${name}`,
        doc: pendingDoc,
        startLine: lineNum,
        endLine: findBlockEnd(lines, i),
        isExported: !!isPub,
      });
      pendingDoc = null;
      continue;
    }

    if (line !== '') pendingDoc = null;
  }

  return blueprint;
}

/**
 * Fallback parser for other files (Markdown, JSON, Shell, HTML, etc.)
 */
function parseGeneric(content, relPath, ext) {
  const blueprint = new FileBlueprint(relPath, ext.replace('.', '') || 'text');
  const lines = content.split('\n');

  if (ext === '.md' || ext === '.markdown') {
    // Extract headers
    lines.forEach((line, idx) => {
      const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headerMatch) {
        blueprint.symbols.push({
          id: `${relPath}#${headerMatch[2].trim()}`,
          name: headerMatch[2].trim(),
          kind: 'section',
          signature: `${headerMatch[1]} ${headerMatch[2].trim()}`,
          doc: null,
          startLine: idx + 1,
          endLine: idx + 1,
          isExported: true,
        });
      }
    });
  } else if (ext === '.json') {
    try {
      const parsed = JSON.parse(content);
      const keys = Object.keys(parsed).slice(0, 15);
      blueprint.symbols.push({
        id: `${relPath}#schema`,
        name: 'JSON Schema Keys',
        kind: 'data',
        signature: `Keys: [${keys.join(', ')}${Object.keys(parsed).length > 15 ? ', ...' : ''}]`,
        doc: null,
        startLine: 1,
        endLine: lines.length,
        isExported: true,
      });
    } catch {
      // Ignore invalid JSON
    }
  }

  return blueprint;
}

/**
 * Helper: Find end line of a brace block { ... }, ignoring braces inside parameter parentheses
 */
function findBlockEnd(lines, startIdx) {
  let inParenDepth = 0;
  let depth = 0;
  let opened = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
      if (!opened) {
        if (char === '(') inParenDepth++;
        else if (char === ')' && inParenDepth > 0) inParenDepth--;
        else if (char === '{' && inParenDepth === 0) {
          depth = 1;
          opened = true;
        }
      } else {
        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth <= 0) {
            return i + 1;
          }
        }
      }
    }
  }
  return Math.min(startIdx + 40, lines.length);
}

/**
 * Helper: Find end line of a Python indentation block
 */
function findPythonBlockEnd(lines, startIdx) {
  const startLine = lines[startIdx];
  const baseIndent = startLine.search(/\S|$/);

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const currentIndent = line.search(/\S|$/);
    if (currentIndent <= baseIndent) {
      return i; // previous non-empty line
    }
  }
  return lines.length;
}

/**
 * Clean params for clean single-line representation
 */
function cleanParams(params) {
  return params.replace(/\s+/g, ' ').trim();
}

/**
 * Parse a file based on extension
 */
export function parseFile(fileRecord) {
  const { content, relativePath, extension } = fileRecord;

  switch (extension) {
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
    case '.mjs':
    case '.cjs':
      return parseJavaScriptOrTypeScript(content, relativePath);
    case '.py':
      return parsePython(content, relativePath);
    case '.go':
      return parseGo(content, relativePath);
    case '.rs':
      return parseRust(content, relativePath);
    default:
      return parseGeneric(content, relativePath, extension);
  }
}

/**
 * Surgical "Dip": extracts the exact implementation of a symbol or line range
 */
export function dipSymbol(fileContent, symbol, contextLines = 2) {
  if (!symbol) return null;
  const lines = fileContent.split('\n');
  const start = Math.max(0, symbol.startLine - 1 - contextLines);
  const end = Math.min(lines.length, symbol.endLine + contextLines);

  return {
    symbolId: symbol.id,
    name: symbol.name,
    kind: symbol.kind,
    signature: symbol.signature,
    startLine: start + 1,
    endLine: end,
    content: lines.slice(start, end).join('\n'),
  };
}
