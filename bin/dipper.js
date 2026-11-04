#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { scanRepository } from '../src/scanner.js';
import { parseFile, dipSymbol } from '../src/parser.js';
import { buildBlueprint, buildJsonBlueprint } from '../src/blueprint.js';
import { startMcpServer } from '../src/mcp.js';
import { renderStatsCard, c } from '../src/utils.js';

const pkg = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

// CLI Argument parsing
const options = {
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
  mcp: { type: 'boolean', short: 'm', default: false },
  json: { type: 'boolean', short: 'j', default: false },
  output: { type: 'string', short: 'o' },
  stdout: { type: 'boolean', short: 's', default: false },
  ignore: { type: 'string' },
};

function printHelp() {
  console.log(`
${c.bold('DIPPER')} ${c.gray(`v${pkg.version} • Dyne Research (https://dyneresearch.com)`)}
${c.cyan('Ultra-compressed architectural blueprints for AI agents with on-demand symbol dipping.')}

${c.bold('USAGE:')}
  $ dipper [directory] [options]
  $ dipper serve                  ${c.gray('# Run as MCP server over stdio')}
  $ dipper dip <symbol_id>        ${c.gray('# Surgically extract a symbol implementation')}

${c.bold('OPTIONS:')}
  -o, --output <path>    Write blueprint to specified file (defaults to .dipper/blueprint.md)
  -m, --mcp              Start as Model Context Protocol (MCP) server
  -j, --json             Output as structured JSON instead of Markdown
  -s, --stdout           Print blueprint directly to standard output
      --ignore <list>    Comma-separated additional patterns to ignore
  -v, --version          Show version number
  -h, --help             Show this help message

${c.bold('EXAMPLES:')}
  $ npx repo-dipper
  $ npx repo-dipper -o my-blueprint.md
  $ npx repo-dipper dip "src/auth.js#verifyToken"
  $ npx -y repo-dipper serve ${c.gray('(in Cursor / Claude Desktop MCP config)')}
`);
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      options,
      allowPositionals: true,
      strict: false,
    });
  } catch (err) {
    console.error(c.red(`Error: ${err.message}`));
    printHelp();
    process.exit(1);
  }

  const { values, positionals } = parsed;

  if (values.version) {
    console.log(pkg.version);
    return;
  }

  if (values.help) {
    printHelp();
    return;
  }

  // Handle MCP server mode (via flag or "serve" command)
  const isMcpMode = values.mcp || positionals[0] === 'serve';
  if (isMcpMode) {
    const targetDir = positionals[0] === 'serve' ? positionals[1] || '.' : positionals[0] || '.';
    await startMcpServer(targetDir);
    return;
  }

  // Handle surgical "dip" CLI command
  if (positionals[0] === 'dip') {
    const symbolTarget = positionals[1];
    if (!symbolTarget) {
      console.error(c.red('Error: Please specify a symbol ID or file path to dip.'));
      console.log('Example: dipper dip "src/auth.js#verifyToken"');
      process.exit(1);
    }

    const scanResult = await scanRepository('.');
    const parsedFiles = scanResult.files.map(parseFile);
    const bp = buildBlueprint({
      files: scanResult.files,
      parsedFiles,
      totalRawTokens: scanResult.totalRawTokens,
      rootDirectory: scanResult.rootDirectory,
    });

    let sym = bp.symbolIndex.get(symbolTarget);
    if (!sym) {
      for (const [key, value] of bp.symbolIndex.entries()) {
        if (key.endsWith(symbolTarget) || key.endsWith('#' + symbolTarget) || value.name === symbolTarget) {
          sym = value;
          break;
        }
      }
    }

    if (sym) {
      const fileRec = scanResult.files.find((f) => f.relativePath === sym.relativePath);
      const dipped = dipSymbol(fileRec.content, sym);
      console.log(c.cyan(`// Dipped: ${dipped.symbolId} (L${dipped.startLine}-L${dipped.endLine})`));
      console.log(dipped.content);
      return;
    } else {
      console.error(c.red(`Symbol not found: "${symbolTarget}"`));
      process.exit(1);
    }
  }

  // Standard Repository Blueprinter
  const targetDir = positionals[0] || '.';
  const ignorePatterns = values.ignore ? values.ignore.split(',').map((s) => s.trim()) : [];

  const startTime = Date.now();
  const scanResult = await scanRepository(targetDir, { ignore: ignorePatterns });
  const parsedFiles = scanResult.files.map(parseFile);

  const blueprint = buildBlueprint({
    files: scanResult.files,
    parsedFiles,
    totalRawTokens: scanResult.totalRawTokens,
    rootDirectory: scanResult.rootDirectory,
  });

  const durationMs = Date.now() - startTime;

  // If stdout flag requested, print and exit
  if (values.stdout) {
    const outputContent = values.json
      ? JSON.stringify(buildJsonBlueprint(blueprint), null, 2)
      : blueprint.markdown;
    process.stdout.write(outputContent);
    return;
  }

  // Otherwise, write output file and print viral stats card
  const outputPath = values.output || path.join('.dipper', values.json ? 'blueprint.json' : 'blueprint.md');
  const resolvedOut = path.resolve(outputPath);

  fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
  fs.writeFileSync(
    resolvedOut,
    values.json
      ? JSON.stringify(buildJsonBlueprint(blueprint), null, 2)
      : blueprint.markdown,
    'utf8'
  );

  const repoName = path.basename(path.resolve(targetDir));
  const statsCard = renderStatsCard({
    repoName,
    fileCount: blueprint.metrics.totalFiles,
    rawTokens: blueprint.metrics.rawTokens,
    blueprintTokens: blueprint.metrics.blueprintTokens,
    savingsPercent: blueprint.metrics.savingsPercent,
    rawCost: blueprint.metrics.rawCost,
    blueprintCost: blueprint.metrics.blueprintCost,
  });

  console.log(statsCard);
  console.log(`  ${c.green('✔')} Indexed in ${c.bold(durationMs + 'ms')}`);
  console.log(`  ${c.green('✔')} Blueprint written to: ${c.bold(path.relative(process.cwd(), resolvedOut))}`);
  console.log(`  ${c.cyan('ℹ')} Symbols mapped: ${c.bold(blueprint.metrics.totalSymbols)}`);
  console.log(`  ${c.dim('Run "dipper serve" to activate MCP server for Cursor & Claude Desktop.')}`);
  console.log(`  ${c.dim('Developed by Dyne Research • https://dyneresearch.com')}\n`);
}

main().catch((err) => {
  console.error(c.red(`Unexpected error: ${err.stack || err.message}`));
  process.exit(1);
});

