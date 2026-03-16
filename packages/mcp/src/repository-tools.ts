import { RepoContextService, RepositoryIdentifier } from '@zilliz/claude-context-core';
import { ensureAbsolutePath } from './utils.js';

export class RepositoryToolHandlers {
    private readonly repoContextService: RepoContextService;

    constructor(repoContextService: RepoContextService) {
        this.repoContextService = repoContextService;
    }

    async handleRepoAdd(args: any) {
        const repoPath = typeof args?.path === 'string' ? args.path.trim() : '';
        if (!repoPath) {
            return {
                content: [{
                    type: 'text',
                    text: "Error: 'path' is required."
                }],
                isError: true
            };
        }

        const absolutePath = ensureAbsolutePath(repoPath);
        const indexNow = args?.indexNow !== false;
        const forceReindex = args?.forceReindex === true;

        try {
            const repository = await this.repoContextService.addRepository(absolutePath, {
                indexNow,
                forceReindex
            });

            return {
                content: [{
                    type: 'text',
                    text:
                        `Repository added: ${repository.path}\n` +
                        `Status: ${repository.status}\n` +
                        `Collection: ${repository.collectionName}\n` +
                        `Index now: ${indexNow}`
                }]
            };
        } catch (error: any) {
            return {
                content: [{
                    type: 'text',
                    text: `Error adding repository: ${error?.message || String(error)}`
                }],
                isError: true
            };
        }
    }

    async handleRepoList(args: any) {
        const refreshStatus = args?.refreshStatus === true;

        try {
            const repositories = await this.repoContextService.listRepositories({ refreshStatus });
            const selected = await this.repoContextService.getSelectedRepository();

            if (repositories.length === 0) {
                return {
                    content: [{
                        type: 'text',
                        text: 'No repositories found in local registry.'
                    }]
                };
            }

            const payload = {
                selectedRepoId: selected?.id,
                registryPath: this.repoContextService.getRegistryPath(),
                repositories
            };

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify(payload, null, 2)
                }]
            };
        } catch (error: any) {
            return {
                content: [{
                    type: 'text',
                    text: `Error listing repositories: ${error?.message || String(error)}`
                }],
                isError: true
            };
        }
    }

    async handleRepoRefresh(args: any) {
        const identifier = this.parseIdentifier(args);
        if (!identifier) {
            return {
                content: [{
                    type: 'text',
                    text: "Error: provide either 'repoId' or 'path'."
                }],
                isError: true
            };
        }

        const forceFullReindex = args?.forceFullReindex === true;
        const allowFullReindexFallback = args?.allowFullReindexFallback !== false;

        try {
            const result = await this.repoContextService.refreshRepository(identifier, {
                forceFullReindex,
                allowFullReindexFallback
            });

            const details = result.mode === 'full'
                ? `Full index stats: ${JSON.stringify(result.fullIndexStats)}`
                : `Incremental sync stats: ${JSON.stringify(result.incrementalSyncStats)}`;

            const fallbackMessage = result.fallbackToFullReindex
                ? `\nFallback to full reindex: yes\nReason: ${result.fallbackReason}`
                : '\nFallback to full reindex: no';

            return {
                content: [{
                    type: 'text',
                    text: `Repository refreshed: ${result.repository.path}\nMode: ${result.mode}${fallbackMessage}\n${details}`
                }]
            };
        } catch (error: any) {
            return {
                content: [{
                    type: 'text',
                    text: `Error refreshing repository: ${error?.message || String(error)}`
                }],
                isError: true
            };
        }
    }

    async handleRepoDelete(args: any) {
        const identifier = this.parseIdentifier(args);
        if (!identifier) {
            return {
                content: [{
                    type: 'text',
                    text: "Error: provide either 'repoId' or 'path'."
                }],
                isError: true
            };
        }

        try {
            const result = await this.repoContextService.deleteRepositoryContext(identifier);

            if (!result.deleted) {
                return {
                    content: [{
                        type: 'text',
                        text: 'Repository not found in local registry.'
                    }],
                    isError: true
                };
            }

            return {
                content: [{
                    type: 'text',
                    text: `Repository context deleted: ${result.repository?.path}`
                }]
            };
        } catch (error: any) {
            return {
                content: [{
                    type: 'text',
                    text: `Error deleting repository context: ${error?.message || String(error)}`
                }],
                isError: true
            };
        }
    }

    private parseIdentifier(args: any): RepositoryIdentifier | null {
        const repoId = typeof args?.repoId === 'string' && args.repoId.trim().length > 0
            ? args.repoId.trim()
            : undefined;
        const repoPath = typeof args?.path === 'string' && args.path.trim().length > 0
            ? ensureAbsolutePath(args.path.trim())
            : undefined;

        if (!repoId && !repoPath) {
            return null;
        }

        return {
            repoId,
            path: repoPath
        };
    }
}
