<div align="center">

# 🪣 Dipper (`repo-dipper`)

### **The Agentic Context-Dipper for LLMs & AI Coding Agents**
**Compress entire codebases into ultra-dense architectural blueprints and let agents "dip" on demand.**

[![npm version](https://img.shields.io/badge/npm-v0.1.0-blue.svg)](https://www.npmjs.com/package/repo-dipper)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)
[![MCP Compliant](https://img.shields.io/badge/MCP-JSON--RPC%202.0-purple.svg)](https://modelcontextprotocol.io)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<br/>

<p align="center">
  <b><i>"Repomix gave AI agents the whole warehouse. Dipper gives them the blueprint and a crane."</i></b>
</p>

<br/>

<p align="center">
  <img src="./testimg.png" alt="Dipper CLI terminal benchmark: 377k tokens reduced to 1.2k tokens (-99.7% reduction) in 298ms" width="820" />
</p>

<p align="center">
  <sub>⚡ <b>Real-world benchmark:</b> 377,409 raw tokens compressed into a 1,217-token blueprint (<b>-99.7% reduction</b>) in 298ms.</sub>
</p>

</div>

---

## ⚡ Quickstart (Zero Installation Required)

Run directly in any repository with Node.js (`npx`):

```bash
npx repo-dipper
```

Generates `.dipper/blueprint.md` in milliseconds and prints your token reduction card.

```bash
# Write blueprint to a custom destination
npx repo-dipper -o blueprint.md

# Surgically dip into any function, class, or route from CLI
npx repo-dipper dip "src/auth.js#verifyToken"
# Or using smart symbol search:
npx repo-dipper dip verifyToken

# Pipe compressed blueprint directly into your clipboard
npx repo-dipper --stdout | pbcopy
```

---

## 🧠 The Problem: The "Context-Stuffing" Trap

When using frontier LLMs (**Claude 3.5 Sonnet, GPT-4o, o1, o3-mini, DeepSeek R1**) for codebase tasks, developers are currently caught between two flawed paradigms:

1. **The Codebase Dump (Repomix / Code2Prompt):** Concatenates every line of code into a single massive 200,000–500,000 token prompt.
   - 💸 **Expensive:** Costs \$0.60–\$2.50 per single prompt turn. In a 10-turn agent session, you burn \$15–\$25.
   - 📉 **Degrades Reasoning:** LLM attention degrades severely on long contexts (the ["Lost in the Middle" phenomenon](https://arxiv.org/abs/2307.03172)). Models miss subtle bugs and hallucinate function signatures.
2. **Arbitrary Chunk RAG (Vector Search):** Slices code into 500-token chunks.
   - ❌ **Breaks Code Topology:** Vector embeddings fail to understand relational dependencies: cross-file imports, class inheritance, interface contracts, and route controllers.

---

## 💡 The Solution: Blueprint & Dip

**Dipper** parses your repository into an ultra-dense **architectural blueprint**—preserving file topology, cross-file import edges, exported classes, interfaces, and function signatures while stripping internal implementation bodies.

When your agent needs to inspect or edit logic, it **"dips"** into the exact function or class implementation dynamically.

```
┌────────────────────────────────┐         (Fast AST pass)         ┌────────────────────────────────┐
│          Raw Codebase          │ ──────────────────────────────> │        Dipper Blueprint        │
│      377,000 tokens ($1.13)    │                                 │       1,200 tokens ($0.003)    │
└────────────────────────────────┘                                 └───────────────┬────────────────┘
                                                                                   │
                                                                                   ▼
                                                                   ┌────────────────────────────────┐
                                                                   │       AI Agent Context         │
                                                                   │   (Claude / Cursor / Cline)    │
                                                                   └───────────────┬────────────────┘
                                                                                   │
                                       Agent requests code:                        │
                                       dip("ai-service/service.py#embed_text")     │
                                                                                   ▼
                                                                   ┌────────────────────────────────┐
                                                                   │      Surgical Code Slice       │
                                                                   │    (Exact Lines + Context)     │
                                                                   └────────────────────────────────┘
```

---

## 🔌 Model Context Protocol (MCP) Server

Dipper is a **native Model Context Protocol (MCP) Server** compliant with the official JSON-RPC 2.0 specification. 

Add Dipper to your editor in 10 seconds to give your AI agent live dipping superpowers:

### 1. Claude Desktop
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "dipper": {
      "command": "npx",
      "args": ["-y", "repo-dipper", "serve"]
    }
  }
}
```

### 2. Cursor / Windsurf / Cline / Roo Code
Add to your MCP Settings configuration:
```json
{
  "mcpServers": {
    "dipper": {
      "command": "npx",
      "args": ["-y", "repo-dipper", "serve"]
    }
  }
}
```

### Exposed MCP Tools:
| Tool | Description |
|---|---|
| `get_repo_blueprint(format)` | Returns the ultra-compressed architectural blueprint of the codebase (markdown or JSON). |
| `dip(symbol_or_path, context_lines)` | Surgically retrieves the exact implementation and surrounding context of a function, class, or route. |
| `search_symbols(query)` | Instantly searches across all indexed symbols, endpoints, and signatures. |

---

## ⚔️ Comparison: Dipper vs. Alternatives

| Feature | Raw Code Dump (Repomix) | Vector RAG | Aider Repo-Map | **Dipper (`repo-dipper`)** |
|---|:---:|:---:|:---:|:---:|
| **Token Overhead** | 🔴 100k - 500k tokens | 🟡 15k - 40k tokens | 🟢 2k - 5k tokens | 🟢 **1k - 4k tokens (-98%)** |
| **API Cost per Turn** | 🔴 \$0.50 - \$2.50 | 🟡 \$0.05 - \$0.15 | 🟢 \$0.01 | 🟢 **\$0.003 - \$0.01** |
| **Cross-File Topology** | 🟢 Preserved | 🔴 Broken (chunking) | 🟢 Preserved | 🟢 **Preserved (Graph Edges)** |
| **On-Demand Dipping** | 🔴 None (all-in) | 🟡 Chunks only | 🔴 None (static) | 🟢 **Yes (Deterministic `dip()`)** |
| **MCP Server Standard** | 🔴 No | 🔴 No | 🔴 No (Aider only) | 🟢 **Native (Cursor / Claude)** |
| **External Dependencies** | 🔴 Multiple dependencies | 🔴 Vector DB required | 🔴 Python environment | 🟢 **Zero Dependencies (Pure Node)** |
| **Startup Speed** | 🟡 1.5s - 5s | 🔴 5s - 30s | 🟡 1s - 3s | 🟢 **10ms - 300ms** |

---

## 🌐 Multi-Language Structural Support

Dipper parses AST structures across standard languages out of the box:

- **TypeScript / JavaScript:** Classes, interfaces, types, exported functions, arrow functions, CommonJS/ESM imports, and Express/Koa route declarations (`app.get`, `router.post`).
- **Python:** Classes, methods, functions, type hints, docstrings, and FastAPI/Flask route decorators (`@app.get`, `@router.post`).
- **Go:** Structs, interfaces, methods (with receivers), and functions.
- **Rust:** Structs, enums, traits, `pub fn` functions, and modules.
- **Config & Documentation:** JSON schema extraction, Markdown header outlines.

---

## 📊 Real-World Benchmarks

| Project / Repository | Raw Tokens | Dipper Blueprint | Reduction | Cost per Prompt (Sonnet 3.5) |
|---|---|---|---|---|
| **AI Inference Microservice** | 377,409 | 1,217 | **-99.7%** | \$1.13 ➔ **\$0.003** |
| **Fullstack Next.js + Prisma** | 184,200 | 3,850 | **-97.9%** | \$0.55 ➔ **\$0.011** |
| **FastAPI Backend + Celery** | 92,400 | 2,150 | **-97.7%** | \$0.28 ➔ **\$0.006** |
| **Express Starter App** | 34,200 | 1,050 | **-96.9%** | \$0.10 ➔ **\$0.003** |

---

## 🛠️ Programmatic Node.js / TypeScript SDK

Embed Dipper directly into custom agent loops (LangChain, LlamaIndex, OpenAI Swarm, or custom scripts):

```javascript
import { scanRepository, parseFile, buildBlueprint, dipSymbol } from 'repo-dipper';

// 1. Scan codebase respecting .gitignore
const scan = await scanRepository('./my-repo');

// 2. Parse structural skeletons
const parsed = scan.files.map(parseFile);

// 3. Generate architectural blueprint
const { markdown, symbolIndex, metrics } = buildBlueprint({
  files: scan.files,
  parsedFiles: parsed,
  totalRawTokens: scan.totalRawTokens,
});

console.log(`Blueprint tokens: ${metrics.blueprintTokens} (${metrics.savingsPercent.toFixed(1)}% savings)`);

// 4. Surgically retrieve a specific symbol implementation
const authSymbol = symbolIndex.get('src/auth.js#verifyToken');
const file = scan.files.find(f => f.relativePath === authSymbol.relativePath);
const slice = dipSymbol(file.content, authSymbol);

console.log(slice.content);
```

---

## ❓ Frequently Asked Questions (FAQ)

<details>
<summary><b>Does Dipper send my code to any third-party cloud or API?</b></summary>
<br/>
<b>No.</b> Dipper runs 100% locally and offline. It contains zero network requests, zero telemetry, and zero third-party dependencies.
</details>

<details>
<summary><b>How is this different from Repomix?</b></summary>
<br/>
Repomix concatenates all your files into a single huge text dump. For small repos, that works; for medium or large repositories, it overwhelms the model's context window and costs dollars per prompt. 

Dipper creates a <b>lossless architectural wireframe</b> (signatures, contracts, routes, and topology) and provides a retrieval tool (<code>dip</code>) so your agent only loads the code it actually needs to inspect or modify.
</details>

<details>
<summary><b>Do I need to install Python, Rust, or Go toolchains?</b></summary>
<br/>
No. Dipper requires only Node.js (>= 18) and uses pure AST structural parsers. It does not require language servers (LSP), Python virtualenvs, or C++ native compiler modules.
</details>

---

## 🤝 Contributing & Community

Contributions are welcome! If you'd like to add support for additional languages (C#, Java, Ruby, PHP) or new MCP capabilities:

1. Fork the repository
2. Create your branch (`git checkout -b feature/cool-parser`)
3. Run tests (`npm test`)
4. Submit a Pull Request

---

## 📄 License

MIT © [Dipper Contributors](LICENSE)
