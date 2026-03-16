import * as vscode from 'vscode';
import { ManagedRepository, RefreshRepositoryResult, RepoContextService } from '@zilliz/claude-context-core';

class RepositoryTreeItem extends vscode.TreeItem {
    readonly repository: ManagedRepository;

    constructor(repository: ManagedRepository, isSelected: boolean) {
        super(repository.name, vscode.TreeItemCollapsibleState.None);
        this.repository = repository;
        this.id = repository.id;
        this.contextValue = 'managedRepository';
        this.description = buildDescription(repository, isSelected);
        this.tooltip = buildTooltip(repository, isSelected);
        this.iconPath = getStatusIcon(repository.status);
        this.command = {
            command: 'semanticCodeSearch.selectRepository',
            title: 'Select Repository',
            arguments: [this]
        };
    }
}

function buildDescription(repository: ManagedRepository, isSelected: boolean): string {
    const marker = isSelected ? 'active' : repository.status;
    const counts = repository.indexedFiles > 0 || repository.indexedChunks > 0
        ? ` | ${repository.indexedFiles}f/${repository.indexedChunks}c`
        : '';
    return `${marker}${counts}`;
}

function buildTooltip(repository: ManagedRepository, isSelected: boolean): vscode.MarkdownString {
    const lines: string[] = [];
    lines.push(`**${repository.name}**`);
    lines.push(`Path: \`${repository.path}\``);
    lines.push(`Status: \`${repository.status}\``);
    if (isSelected) {
        lines.push('Selected: `yes`');
    }
    lines.push(`Collection: \`${repository.collectionName}\``);
    lines.push(`Indexed files: \`${repository.indexedFiles}\``);
    lines.push(`Indexed chunks: \`${repository.indexedChunks}\``);

    if (repository.lastIndexedAt) {
        lines.push(`Last indexed: \`${new Date(repository.lastIndexedAt).toLocaleString()}\``);
    }

    if (repository.lastError) {
        lines.push(`Last error: \`${repository.lastError}\``);
    }

    const tooltip = new vscode.MarkdownString(lines.join('  \n'));
    tooltip.isTrusted = false;
    return tooltip;
}

function getStatusIcon(status: ManagedRepository['status']): vscode.ThemeIcon {
    switch (status) {
        case 'indexed':
            return new vscode.ThemeIcon('check');
        case 'indexing':
            return new vscode.ThemeIcon('sync~spin');
        case 'stale':
            return new vscode.ThemeIcon('warning');
        case 'failed':
            return new vscode.ThemeIcon('error');
        case 'deleting':
            return new vscode.ThemeIcon('trash');
        case 'not_indexed':
        default:
            return new vscode.ThemeIcon('circle-large-outline');
    }
}

export class RepositoryManagerProvider implements vscode.TreeDataProvider<RepositoryTreeItem> {
    static readonly viewType = 'repositoryManagerView';

    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<RepositoryTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<RepositoryTreeItem | undefined | void> = this.onDidChangeTreeDataEmitter.event;

    private repoContextService: RepoContextService;

    constructor(repoContextService: RepoContextService) {
        this.repoContextService = repoContextService;
    }

    setRepoContextService(repoContextService: RepoContextService): void {
        this.repoContextService = repoContextService;
        this.refresh();
    }

    refresh(): void {
        this.onDidChangeTreeDataEmitter.fire();
    }

    getTreeItem(element: RepositoryTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: RepositoryTreeItem): Promise<RepositoryTreeItem[]> {
        if (element) {
            return [];
        }

        const [repositories, selectedRepo] = await Promise.all([
            this.repoContextService.listRepositories({ refreshStatus: true }),
            this.repoContextService.getSelectedRepository()
        ]);

        return repositories.map(repo => new RepositoryTreeItem(repo, selectedRepo?.id === repo.id));
    }

    async addRepository(): Promise<void> {
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Add Repository'
        });

        if (!selected || selected.length === 0) {
            return;
        }

        const targetPath = selected[0].fsPath;
        const indexChoice = await vscode.window.showQuickPick(
            ['Index Now', 'Add Without Indexing'],
            { placeHolder: 'Choose how to add the repository' }
        );

        if (!indexChoice) {
            return;
        }

        const indexNow = indexChoice === 'Index Now';

        try {
            let repository: ManagedRepository | undefined;
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: indexNow ? 'Adding and indexing repository' : 'Adding repository',
                cancellable: false
            }, async () => {
                repository = await this.repoContextService.addRepository(targetPath, {
                    indexNow,
                    forceReindex: false
                });
                if (repository) {
                    await this.repoContextService.selectRepository({ repoId: repository.id });
                }
            });

            this.refresh();
            vscode.window.showInformationMessage(
                repository
                    ? `Repository added: ${repository.path}`
                    : `Repository added: ${targetPath}`
            );
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to add repository: ${error?.message || String(error)}`);
        }
    }

    async refreshRepository(item?: RepositoryTreeItem): Promise<void> {
        const repository = item?.repository || await this.pickRepository('Select repository to refresh');
        if (!repository) {
            return;
        }

        try {
            let result: RefreshRepositoryResult | undefined;
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Refreshing repository context',
                cancellable: false
            }, async () => {
                result = await this.repoContextService.refreshRepository(
                    { repoId: repository.id },
                    {
                        forceFullReindex: false,
                        allowFullReindexFallback: true
                    }
                );
            });

            this.refresh();
            if (result?.fallbackToFullReindex) {
                vscode.window.showWarningMessage(
                    `Repository refreshed with full reindex fallback: ${repository.path}`
                );
            } else {
                vscode.window.showInformationMessage(`Repository refreshed incrementally: ${repository.path}`);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to refresh repository: ${error?.message || String(error)}`);
        }
    }

    async deleteRepository(item?: RepositoryTreeItem): Promise<void> {
        const repository = item?.repository || await this.pickRepository('Select repository to delete');
        if (!repository) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Delete repository context for '${repository.name}'? This removes Milvus index data and local registry metadata.`,
            { modal: true },
            'Delete',
            'Cancel'
        );

        if (confirm !== 'Delete') {
            return;
        }

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Deleting repository context',
                cancellable: false
            }, async () => {
                await this.repoContextService.deleteRepositoryContext({ repoId: repository.id });
            });

            this.refresh();
            vscode.window.showInformationMessage(`Repository context deleted: ${repository.path}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to delete repository context: ${error?.message || String(error)}`);
        }
    }

    async selectRepository(item?: RepositoryTreeItem): Promise<void> {
        const repository = item?.repository || await this.pickRepository('Select active repository');
        if (!repository) {
            return;
        }

        try {
            await this.repoContextService.selectRepository({ repoId: repository.id });
            this.refresh();
            vscode.window.showInformationMessage(`Active repository: ${repository.path}`);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to select repository: ${error?.message || String(error)}`);
        }
    }

    private async pickRepository(placeHolder: string): Promise<ManagedRepository | undefined> {
        const repositories = await this.repoContextService.listRepositories({ refreshStatus: false });

        if (repositories.length === 0) {
            vscode.window.showInformationMessage('No repositories in local registry. Add one first.');
            return undefined;
        }

        const selected = await vscode.window.showQuickPick(
            repositories.map(repo => ({
                label: repo.name,
                description: repo.status,
                detail: repo.path,
                repository: repo
            })),
            { placeHolder }
        );

        return selected?.repository;
    }
}
