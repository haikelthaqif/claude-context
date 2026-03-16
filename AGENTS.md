## Goal

Turn this repo into a local-first GUI-managed code context tool.

## Non-negotiable requirements

- Keep Milvus as the vector database.
- Run Milvus locally only. Do not use Zilliz Cloud or any cloud DB.
- Do not remove the existing MCP-server approach.
- Do not rewrite the core semantic indexing/search flow unless necessary.
- Prefer extending the existing core package and MCP package over replacing them.
- Build a GUI-first workflow for managing indexed repositories.
- Target VS Code first.
- The GUI must support:
  - add/select repo
  - list indexed repos
  - show status per repo
  - refresh/reindex repo context
  - delete repo context
  - optional auto-watch for changed files
- Preserve compatibility with MCP-capable coding agents where practical.
- Keep changes modular and production-oriented.

## Architecture preferences

- Reuse the existing monorepo package boundaries where possible.
- Keep Milvus for vectors.
- Add a lightweight local metadata store for repo registry and index state.
- Prefer incremental indexing for changed files instead of full reindex where possible.
- Keep the MCP server as the shared backend surface for coding agents.
- Build the GUI either into the existing VS Code extension or as a closely related package.

## Working style

- Before making major edits, write a concrete implementation plan.
- Show the exact files/packages that will be changed.
- Implement in small phases with checkpoints.
- After each phase, run relevant build/test commands and summarize results.
- If you need to make an assumption, document it in the plan or README.
- Avoid unnecessary dependency churn.
- Do not switch the database away from Milvus.
