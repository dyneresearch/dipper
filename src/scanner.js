import fs from 'node:fs';
import path from 'node:path';
import { normalizePath, estimateTokens } from './utils.js';

// Common files and folders to ignore by default
const DEFAULT_IGNORE_PATTERNS = [
  // VCS
  '.git', '.svn', '.hg', '.DS_Store', 'Thumbs.db',
  // Dependencies & Environments
  'node_modules', 'vendor', 'venv', '.venv', 'env', '.env', '.env.local',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  // Build outputs
  'dist', 'build', 'out', '.next', '.nuxt', '.turbo', '.svelte-kit', 'target',
  'bin', 'obj', '.output', 'coverage', '.nyc_output',
  // Cache & Temp
  '.cache', '.temp', 'tmp', '.idea', '.vscode',
  // Lockfiles (Huge token wasters for AI agents)
  'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'Cargo.lock', 'poetry.lock',
  'composer.lock', 'Gemfile.lock', 'bun.lockb',
  // Minified & sourcemaps
  '*.min.js', '*.min.css', '*.map', '*.bundle.js',
  // Binary / Media
  '*.png', '*.jpg', '*.jpeg', '*.gif', '*.ico', '*.webp', '*.svg',
  '*.mp3', '*.mp4', '*.wav', '*.ogg', '*.mov',
  '*.pdf', '*.zip', '*.tar', '*.gz', '*.7z', '*.rar',
  '*.woff', '*.woff2', '*.ttf', '*.eot',
  '*.exe', '*.dll', '*.so', '*.dylib', '*.bin', '*.iso',
  // Dipper output
  '.dipper',
];

/**
 * Checks if a relative path matches an ignore pattern or list
 */
function shouldIgnore(relPath, customPatterns = []) {
  const parts = relPath.split('/');
  const fileName = parts[parts.length - 1];

  const allPatterns = [...DEFAULT_IGNORE_PATTERNS, ...customPatterns];

  for (const pattern of allPatterns) {
    if (!pattern || pattern.startsWith('#')) continue;

    const cleanPattern = pattern.trim();
    if (!cleanPattern) continue;

    // Wildcard matching e.g. *.min.js
    if (cleanPattern.startsWith('*.')) {
      const ext = cleanPattern.slice(1);
      if (fileName.endsWith(ext)) return true;
    }

    // Exact filename or folder name match
    if (cleanPattern === fileName || parts.includes(cleanPattern)) {
      return true;
    }

    // Path prefix or suffix match
    if (relPath === cleanPattern || relPath.startsWith(cleanPattern + '/')) {
      return true;
    }
  }

  return false;
}

/**
 * Read and parse .gitignore file if it exists
 */
function loadGitignore(dir) {
  const gitignorePath = path.join(dir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return [];

  try {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    return [];
  }
}

/**
 * Recursively scans directory and collects eligible code files.
 */
export async function scanRepository(rootDirectory, options = {}) {
  const absRoot = path.resolve(rootDirectory);
  const gitignorePatterns = loadGitignore(absRoot);
  const userPatterns = options.ignore || [];
  const combinedPatterns = [...gitignorePatterns, ...userPatterns];

  const results = [];
  let totalRawTokens = 0;
  let totalRawBytes = 0;

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = normalizePath(path.relative(absRoot, fullPath));

      if (shouldIgnore(relPath, combinedPatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          // Skip files larger than 1.5MB by default to avoid memory bloat
          if (stats.size > 1.5 * 1024 * 1024) continue;

          // Check if binary by checking null bytes in first 512 bytes
          const fd = fs.openSync(fullPath, 'r');
          const buffer = Buffer.alloc(Math.min(512, stats.size));
          fs.readSync(fd, buffer, 0, buffer.length, 0);
          fs.closeSync(fd);

          if (buffer.includes(0)) {
            // Binary file detected
            continue;
          }

          const content = fs.readFileSync(fullPath, 'utf8');
          const tokens = estimateTokens(content);

          totalRawTokens += tokens;
          totalRawBytes += stats.size;

          results.push({
            fullPath,
            relativePath: relPath,
            size: stats.size,
            extension: path.extname(entry.name).toLowerCase(),
            content,
            tokens,
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(absRoot);

  return {
    rootDirectory: absRoot,
    files: results,
    totalFiles: results.length,
    totalRawTokens,
    totalRawBytes,
  };
}

