import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { scanRepository } from './scanner.js';
import { parseFile, dipSymbol } from './parser.js';
import { buildBlueprint, buildJsonBlueprint } from './blueprint.js';

/**
 * High-Reliability Zero-Dependency Model Context Protocol (MCP) Server
 */
export async function startMcpServer(targetDirectory = process.cwd()) {
  let repositoryData = null;
  let blueprintData = null;

  // Helper to ensure repository is indexed
  async function ensureIndexed() {
    if (!blueprintData) {
      const scanResult = await scanRepository(targetDirectory);
      const parsedFiles = scanResult.files.map(parseFile);
      blueprintData = buildBlueprint({
        files: scanResult.files,
        parsedFiles,
        totalRawTokens: scanResult.totalRawTokens,
        rootDirectory: scanResult.rootDirectory,
      });
      repositoryData = { scanResult, parsedFiles };
    }
    return blueprintData;
  }

  // Pre-index repository
  await ensureIndexed();

  // Send message over stdout
  function send(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n');
  }

  // Log debug information over stderr (MCP standard: stdout is strictly JSON-RPC)
  function log(...args) {
    process.stderr.write(`[dipper-mcp] ${args.join(' ')}\n`);
  }

  log('Starting Dipper MCP Server in:', targetDirectory);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request;
    try {
      request = JSON.parse(trimmed);
    } catch (err) {
      log('Failed to parse incoming JSON-RPC:', err.message);
      return;
    }

    const { id, method, params } = request;

    try {
      // 1. Initialize
      if (method === 'initialize') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'repo-dipper',
              version: '0.1.0',
            },
          },
        });
        return;
      }

      // 2. Notifications (e.g. notifications/initialized)
      if (method === 'notifications/initialized') {
        log('Client initialized connection.');
        return;
      }

      // 3. Ping
      if (method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} });
        return;
      }

      // 4. Tools List
      if (method === 'tools/list') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            tools: [
              {
                name: 'get_repo_blueprint',
                description:
                  'Returns an ultra-compressed architectural blueprint of the codebase with file topology, symbol signatures, types, routes, and dependency graph. Typically 95%+ smaller than feeding raw code.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    format: {
                      type: 'string',
                      enum: ['markdown', 'json'],
                      description: 'Output format (markdown or json). Defaults to markdown.',
                    },
                  },
                },
              },
              {
                name: 'dip',
                description:
                  'Surgically dips into a specific symbol or file to retrieve its complete implementation and immediate context without loading the rest of the codebase.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    symbol_or_path: {
                      type: 'string',
                      description:
                        'The symbol ID (e.g. "src/auth.js#verifyToken") or file path (e.g. "src/auth.js").',
                    },
                    context_lines: {
                      type: 'number',
                      description: 'Surrounding context lines to include. Default is 2.',
                    },
                  },
                  required: ['symbol_or_path'],
                },
              },
              {
                name: 'search_symbols',
                description:
                  'Searches across all indexed symbols, functions, routes, classes, and types in the repository.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'Search keyword or symbol name.',
                    },
                  },
                  required: ['query'],
                },
              },
            ],
          },
        });
        return;
      }

      // 5. Tools Call
      if (method === 'tools/call') {
        const { name, arguments: args = {} } = params || {};
        const bp = await ensureIndexed();

        if (name === 'get_repo_blueprint') {
          const isJson = args.format === 'json';
          const contentText = isJson
            ? JSON.stringify(buildJsonBlueprint(bp), null, 2)
            : bp.markdown;

          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: contentText,
                },
              ],
            },
          });
          return;
        }

        if (name === 'dip') {
          const target = args.symbol_or_path || '';
          const contextLines = Number(args.context_lines) || 2;

          // Check if target is a symbol ID (exact or partial suffix match)
          let sym = bp.symbolIndex.get(target);
          if (!sym) {
            for (const [key, val] of bp.symbolIndex.entries()) {
              if (key.endsWith(target) || key.endsWith('#' + target) || val.name === target) {
                sym = val;
                break;
              }
            }
          }

          if (sym) {
            const fileRec = repositoryData.scanResult.files.find(
              (f) => f.relativePath === sym.relativePath
            );
            if (fileRec) {
              const dipped = dipSymbol(fileRec.content, sym, contextLines);
              send({
                jsonrpc: '2.0',
                id,
                result: {
                  content: [
                    {
                      type: 'text',
                      text: `// Dipped: ${dipped.symbolId} (Lines ${dipped.startLine}-${dipped.endLine})\n${dipped.content}`,
                    },
                  ],
                },
              });
              return;
            }
          }

          // Check if target matches a relative file path
          const matchingFile = repositoryData.scanResult.files.find(
            (f) => f.relativePath === target || f.relativePath.endsWith('/' + target)
          );

          if (matchingFile) {
            send({
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: `// Full File: ${matchingFile.relativePath} (${matchingFile.tokens} tokens)\n${matchingFile.content}`,
                  },
                ],
              },
            });
            return;
          }

          // Not found
          send({
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: `Symbol or file not found: "${target}". Call get_repo_blueprint() or search_symbols() to view valid symbols.`,
                },
              ],
            },
          });
          return;
        }

        if (name === 'search_symbols') {
          const q = (args.query || '').toLowerCase();
          const matches = [];

          bp.symbolIndex.forEach((sym) => {
            if (
              sym.name.toLowerCase().includes(q) ||
              sym.id.toLowerCase().includes(q) ||
              (sym.signature && sym.signature.toLowerCase().includes(q))
            ) {
              matches.push({
                id: sym.id,
                kind: sym.kind,
                signature: sym.signature,
                file: sym.relativePath,
                lines: `L${sym.startLine}-L${sym.endLine}`,
              });
            }
          });

          send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(matches.slice(0, 30), null, 2),
                },
              ],
            },
          });
          return;
        }

        // Unknown tool
        send({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method or tool "${name}" not found.`,
          },
        });
        return;
      }

      // Default fallback
      send({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Unsupported method: ${method}`,
        },
      });
    } catch (err) {
      log('Error handling request:', err.stack || err.message);
      if (id !== undefined) {
        send({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: err.message,
          },
        });
      }
    }
  });

  log('Ready to receive MCP requests.');
}

