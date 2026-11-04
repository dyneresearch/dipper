import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { scanRepository } from '../src/scanner.js';
import { parseFile, dipSymbol } from '../src/parser.js';
import { buildBlueprint, buildJsonBlueprint } from '../src/blueprint.js';
import { estimateTokens, estimateCost, formatNumber } from '../src/utils.js';

async function runTests() {
  console.log('🧪 Starting Dipper Test Suite...\n');

  // Test 1: Utils & Token Estimator
  console.log('▶ Testing Token Estimation...');
  const sampleCode = `
    import express from 'express';
    const app = express();
    app.get('/api/users', (req, res) => {
      res.json({ status: 'ok', count: 42 });
    });
  `;
  const tokens = estimateTokens(sampleCode);
  assert(tokens > 10 && tokens < 60, `Tokens unexpected: ${tokens}`);
  assert.strictEqual(formatNumber(1234567), '1,234,567');
  console.log('  ✔ Token estimation and formatting passed.');

  // Test 2: Scanner
  console.log('\n▶ Testing Repository Scanner...');
  const scanResult = await scanRepository('.');
  assert(scanResult.files.length >= 5, 'Should find at least 5 files');
  assert(scanResult.totalRawTokens > 1000, 'Should estimate raw tokens');
  const hasScanner = scanResult.files.some((f) => f.relativePath === 'src/scanner.js');
  assert(hasScanner, 'Should index src/scanner.js');
  console.log(`  ✔ Scanner indexed ${scanResult.files.length} files successfully.`);

  // Test 3: Parser (Multi-Language)
  console.log('\n▶ Testing Multi-Language Parser...');

  // Python test
  const pyCode = `
"""Module docstring for auth service"""
import os
from datetime import datetime

class AuthService:
    """Handles user JWT tokens"""
    def __init__(self, secret: str):
        self.secret = secret

    def verify_token(self, token: str) -> bool:
        return True

@app.get("/api/v1/auth/status")
def auth_status():
    return {"status": "active"}
`;
  const pyParsed = parseFile({
    content: pyCode,
    relativePath: 'services/auth.py',
    extension: '.py',
  });
  assert.strictEqual(pyParsed.language, 'python');
  assert.strictEqual(pyParsed.moduleDoc, 'Module docstring for auth service');
  assert(pyParsed.symbols.some((s) => s.name === 'AuthService' && s.kind === 'class'));
  assert(pyParsed.symbols.some((s) => s.name === 'verify_token' && s.kind === 'function'));
  assert(pyParsed.symbols.some((s) => s.kind === 'route'));

  // Go test
  const goCode = `
package main
import "fmt"

type Server struct {
    Port int
}

func (s *Server) Start() error {
    return nil
}
`;
  const goParsed = parseFile({
    content: goCode,
    relativePath: 'main.go',
    extension: '.go',
  });
  assert.strictEqual(goParsed.language, 'go');
  assert(goParsed.symbols.some((s) => s.name === 'Server' && s.kind === 'struct'));
  assert(goParsed.symbols.some((s) => s.name === 'Start' && s.kind === 'function'));

  // Rust test
  const rsCode = `
pub struct UserConfig {
    pub max_tokens: usize,
}

pub fn calculate_cost(tokens: usize) -> f64 {
    (tokens as f64) * 0.000003
}
`;
  const rsParsed = parseFile({
    content: rsCode,
    relativePath: 'src/lib.rs',
    extension: '.rs',
  });
  assert.strictEqual(rsParsed.language, 'rust');
  assert(rsParsed.symbols.some((s) => s.name === 'UserConfig' && s.kind === 'struct'));
  assert(rsParsed.symbols.some((s) => s.name === 'calculate_cost' && s.kind === 'function'));

  console.log('  ✔ Python, Go, and Rust parsing passed.');

  // Test 4: Blueprint Generation & Compression
  console.log('\n▶ Testing Blueprint Generation...');
  const parsedFiles = scanResult.files.map(parseFile);
  const bp = buildBlueprint({
    files: scanResult.files,
    parsedFiles,
    totalRawTokens: scanResult.totalRawTokens,
    rootDirectory: scanResult.rootDirectory,
  });

  assert(bp.metrics.savingsPercent > 50, `Expected >50% compression, got ${bp.metrics.savingsPercent}%`);
  assert(bp.markdown.includes('ARCHITECTURAL BLUEPRINT (DIPPER PROTOCOL)'));
  assert(bp.symbolIndex.size > 10, 'Expected symbols to be indexed');

  const jsonBp = buildJsonBlueprint(bp);
  assert(jsonBp.symbols.length > 0, 'JSON blueprint symbols should be present');
  console.log(`  ✔ Blueprint achieved ${bp.metrics.savingsPercent.toFixed(1)}% compression ratio.`);

  // Test 5: Surgical Dip
  console.log('\n▶ Testing Surgical Dip...');
  const targetSymbol = bp.symbolIndex.get('src/utils.js#estimateTokens');
  assert(targetSymbol, 'Target symbol src/utils.js#estimateTokens should exist');
  const utilsFile = scanResult.files.find((f) => f.relativePath === 'src/utils.js');
  const dipped = dipSymbol(utilsFile.content, targetSymbol);
  assert(dipped.content.includes('function estimateTokens'));
  assert(dipped.startLine < dipped.endLine);
  console.log(`  ✔ Surgical dip extracted ${dipped.endLine - dipped.startLine + 1} lines.`);

  // Test 6: Live MCP Server (JSON-RPC over stdio)
  console.log('\n▶ Testing Live MCP Server (stdio JSON-RPC 2.0)...');
  await testMcpServer();
  console.log('  ✔ MCP Server handled initialize, tools/list, and tools/call.');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

function testMcpServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['./bin/dipper.js', 'serve'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let buffer = '';

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep partial line

      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line.trim());

        if (msg.id === 1) {
          // Initialize response received
          assert.strictEqual(msg.result.serverInfo.name, 'repo-dipper');
          // Send tools/list
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
        } else if (msg.id === 2) {
          // Tools list response received
          assert(msg.result.tools.some((t) => t.name === 'get_repo_blueprint'));
          assert(msg.result.tools.some((t) => t.name === 'dip'));
          // Call dip tool
          child.stdin.write(
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              method: 'tools/call',
              params: {
                name: 'dip',
                arguments: { symbol_or_path: 'src/utils.js#estimateTokens' },
              },
            }) + '\n'
          );
        } else if (msg.id === 3) {
          // Dip tool response received
          assert(msg.result.content[0].text.includes('estimateTokens'));
          child.kill();
          resolve();
        }
      }
    });

    child.stderr.on('data', (errChunk) => {
      // Debug output from server stderr (allowed by MCP spec)
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`MCP server process exited with code ${code}`));
      }
    });

    // Start with initialize request
    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' },
      }) + '\n'
    );
  });
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});

