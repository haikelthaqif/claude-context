# Claude Context (Local-First)

Claude Context is a local-first repository context manager for AI coding agents.

This repository now focuses on:
- local Milvus only (no cloud vector DB)
- MCP server compatibility for coding agents
- a VS Code GUI workflow for repository context management
- incremental refresh by changed-file detection, with safe full-reindex fallback behind the same Refresh action

## What You Get

- VS Code sidebar GUI to:
  - add/select repositories
  - list indexed repositories
  - view per-repo status (indexed, stale, indexing, failed, timestamps, file/chunk counts)
  - refresh/reindex context
  - delete repo context
- MCP server tools for coding-agent workflows
- Core semantic indexing/search flow reused from the original architecture

## Local-Only Architecture

- `packages/core`
  - semantic indexing/search and incremental sync primitives
  - local repo registry + repo context orchestration service
- `packages/mcp`
  - MCP server surface for indexing/search and repo management
- `packages/vscode-extension`
  - GUI-first repo manager (tree view) + semantic search panel
- Storage
  - vectors: local Milvus
  - local metadata/registry: `~/.context/repo-registry.json`

## Prerequisites

- Node.js 20.x or 22.x
- `pnpm` (or `corepack`)
- Docker (for local Milvus)
- VS Code (for GUI workflow)

## 1) Start Milvus Locally

Run Milvus standalone in Docker:

```bash
docker run -d --name milvus-standalone \
  -p 19530:19530 \
  -p 9091:9091 \
  milvusdb/milvus:v2.5.4 \
  milvus run standalone
```

Optional health check:

```bash
curl http://localhost:9091/healthz
```

## 2) Install and Build

```bash
git clone https://github.com/zilliztech/claude-context.git
cd claude-context

corepack pnpm install
```

Build packages:

```bash
corepack pnpm --filter @zilliz/claude-context-core exec tsc --build --force
corepack pnpm --filter @zilliz/claude-context-mcp exec tsc --build --force
corepack pnpm --filter semanticcodesearch exec tsc --build --force
corepack pnpm --filter semanticcodesearch exec node copy-assets.js
```

## 3) Run the VS Code GUI (Primary Workflow)

1. Open this repo in VS Code.
2. Start extension host:
   - open `packages/vscode-extension` in VS Code
   - press `F5` (Run Extension)
3. In the extension host window, open the **Semantic Code Search** activity bar.
4. Use the **Repository Contexts** view.

## 4) GUI Workflow

### Add Repository

- Click `Add Repository` in the Repository Contexts view title bar.
- Choose a folder.
- Choose `Index Now` or `Add Without Indexing`.

### Select Repository

- Click a repository item (or use context menu `Select Repository`).
- Selected item is marked as `active`.

### Refresh / Update Context

- Use `Refresh Repository Context` from item menu.
- Behavior:
  - incremental refresh first (`reindexByChange`)
  - automatic full reindex fallback only when index consistency requires it

### Delete Context

- Use `Delete Repository Context` from item menu.
- This removes:
  - Milvus collection for that repo
  - local registry metadata
  - file-sync snapshot state

### Status Indicators

Each repo shows:
- status (`not_indexed`, `indexing`, `indexed`, `stale`, `failed`, `deleting`)
- indexed file/chunk counts (when available)
- timestamps and error context in tooltip

## 5) Run MCP Server (Agent Compatibility)

Run MCP locally with local Milvus:

```bash
# PowerShell
$env:OPENAI_API_KEY="sk-..."
$env:MILVUS_ADDRESS="localhost:19530"
node packages/mcp/dist/index.js
```

If you want fully local embeddings, use Ollama:

```bash
$env:EMBEDDING_PROVIDER="Ollama"
$env:EMBEDDING_MODEL="nomic-embed-text"
$env:OLLAMA_HOST="http://127.0.0.1:11434"
$env:MILVUS_ADDRESS="localhost:19530"
node packages/mcp/dist/index.js
```

## 6) MCP Tool Surface

Existing indexing/search tools:
- `index_codebase`
- `search_code`
- `clear_index`
- `get_indexing_status`

Repo-management tools:
- `add_repository`
- `list_repositories`
- `refresh_repository`
- `delete_repository`

`refresh_repository` is incremental-first and supports full-reindex fallback.

## 7) Local Config Notes

### Milvus

- VS Code extension setting: `semanticCodeSearch.milvus.address`
  - use: `http://localhost:19530`
- MCP env: `MILVUS_ADDRESS`
  - use: `localhost:19530`

### Registry Path Override

- VS Code setting: `semanticCodeSearch.repoRegistry.path`
- MCP env (through service initialization): `CONTEXT_REPO_REGISTRY_PATH`

Default path if unset:
- `~/.context/repo-registry.json`

## 8) Validation Checklist

After setup, verify:
1. Milvus is running locally on `19530`.
2. Add a repo from GUI and choose `Index Now`.
3. Repo appears in `Repository Contexts` with `indexed` status.
4. Modify files in that repo and run `Refresh Repository Context`.
5. Refresh completes incrementally (fallback only when needed).
6. Delete repo context and confirm it is removed from list.
7. MCP server can still index/search via MCP tools.

## Development Commands

```bash
# Core
corepack pnpm --filter @zilliz/claude-context-core exec tsc --build --force

# MCP
corepack pnpm --filter @zilliz/claude-context-mcp exec tsc --build --force

# VS Code extension
corepack pnpm --filter semanticcodesearch exec tsc --build --force
corepack pnpm --filter semanticcodesearch exec node copy-assets.js
```

## License

MIT

