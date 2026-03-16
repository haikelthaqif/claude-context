# Semantic Code Search VS Code Extension

Local-first repository context manager UI for Claude Context.

This extension targets VS Code first and provides:
- semantic search panel
- repository manager sidebar (add/select/list/status/refresh/delete)
- local Milvus integration

## Requirements

- VS Code 1.74+
- Local Milvus (required)
- Embedding provider config (OpenAI/VoyageAI/Gemini/Ollama)

## Start Local Milvus

```bash
docker run -d --name milvus-standalone \
  -p 19530:19530 \
  -p 9091:9091 \
  milvusdb/milvus:v2.5.4 \
  milvus run standalone
```

Extension Milvus setting should use:
- `semanticCodeSearch.milvus.address = http://localhost:19530`

## Build Extension

```bash
corepack pnpm --filter semanticcodesearch exec tsc --build --force
corepack pnpm --filter semanticcodesearch exec node copy-assets.js
```

## Run in Extension Host

1. Open `packages/vscode-extension` in VS Code.
2. Press `F5` to launch an Extension Development Host.
3. Open the `Semantic Code Search` activity bar.

## GUI Workflow

### Repository Contexts View

Use the `Repository Contexts` tree view to:
- `Add Repository`
- select active repository
- see status and counts
- `Refresh Repository Context`
- `Delete Repository Context`

Refresh behavior:
- incremental changed-file sync first
- full reindex fallback automatically when needed

### Semantic Search View

Use `Semantic Search` webview to:
- configure embedding and Milvus settings
- index/search code
- open matched files directly

## Commands

- `Semantic Code Search: Semantic Search`
- `Semantic Code Search: Index Codebase`
- `Semantic Code Search: Clear Index`
- `Repository Context: Add Repository`
- `Repository Context: Refresh Repository List`
- `Repository Context: Select Repository`
- `Repository Context: Refresh Repository Context`
- `Repository Context: Delete Repository Context`

## Optional Settings

- `semanticCodeSearch.repoRegistry.path`
  - override local registry file path
  - default: `~/.context/repo-registry.json`

## Related

- [Root README](../../README.md)
- [MCP package](../mcp)
- [Core package](../core)
