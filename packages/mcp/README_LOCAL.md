# @zilliz/claude-context-mcp

Local-first MCP server for Claude Context.

This package is intended to run with:
- local Milvus (required)
- MCP-capable coding agents
- optional local embeddings via Ollama

## Prerequisites

- Node.js 20.x or 22.x
- Local Milvus on `localhost:19530`
- Embedding provider credentials (or Ollama)

## Local Milvus

```bash
docker run -d --name milvus-standalone \
  -p 19530:19530 \
  -p 9091:9091 \
  milvusdb/milvus:v2.5.4 \
  milvus run standalone
```

## Build

```bash
corepack pnpm --filter @zilliz/claude-context-core exec tsc --build --force
corepack pnpm --filter @zilliz/claude-context-mcp exec tsc --build --force
```

## Run (OpenAI embeddings)

```bash
# PowerShell
$env:OPENAI_API_KEY="sk-..."
$env:MILVUS_ADDRESS="localhost:19530"
node packages/mcp/dist/index.js
```

## Run (fully local embeddings with Ollama)

```bash
$env:EMBEDDING_PROVIDER="Ollama"
$env:EMBEDDING_MODEL="nomic-embed-text"
$env:OLLAMA_HOST="http://127.0.0.1:11434"
$env:MILVUS_ADDRESS="localhost:19530"
node packages/mcp/dist/index.js
```

## MCP Tools

Index/search tools:
- `index_codebase`
- `search_code`
- `clear_index`
- `get_indexing_status`

Repository management tools:
- `add_repository`
- `list_repositories`
- `refresh_repository`
- `delete_repository`

`refresh_repository` behavior:
- incremental refresh first
- automatic full reindex fallback when index inconsistency is detected
- optional control: `allowFullReindexFallback` (default `true`)

## Local Metadata

- Default registry file: `~/.context/repo-registry.json`
- Override path with: `CONTEXT_REPO_REGISTRY_PATH`

## Related

- [Root README](../../README.md)
- [Core package](../core)
- [VS Code extension](../vscode-extension)
