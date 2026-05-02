import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Context } from '../context';
import { JsonRepositoryRegistryStore } from '../repo-registry/json-repository-registry-store';
import { ManagedRepository, RepositoryStatus } from '../repo-registry/types';
import {
    AddRepositoryOptions,
    DeleteRepositoryResult,
    ListRepositoriesOptions,
    RefreshRepositoryOptions,
    RefreshRepositoryResult,
    RepositoryIdentifier
} from './types';

export class RepoContextService {
    private readonly context: Context;
    private readonly registryStore: JsonRepositoryRegistryStore;
    private operationQueue: Promise<void> = Promise.resolve();

    constructor(context: Context, registryStore?: JsonRepositoryRegistryStore) {
        this.context = context;
        this.registryStore = registryStore || new JsonRepositoryRegistryStore();
    }

    getRegistryPath(): string {
        return this.registryStore.getFilePath();
    }

    async addRepository(repoPath: string, options: AddRepositoryOptions = {}): Promise<ManagedRepository> {
        const repository = await this.withOperationLock(async () => {
            const absolutePath = await this.resolveAndValidateRepoPath(repoPath);
            const existing = await this.registryStore.getRepositoryByPath(absolutePath);
            const nextRepository = this.buildRepositoryRecord(absolutePath, existing || undefined);
            await this.registryStore.saveRepository(nextRepository);
            return nextRepository;
        });

        if (!options.indexNow) {
            return repository;
        }

        const refreshed = await this.refreshRepository({ repoId: repository.id }, {
            forceFullReindex: options.forceReindex,
            allowFullReindexFallback: true
        });
        return refreshed.repository;
    }

    async listRepositories(options: ListRepositoriesOptions = {}): Promise<ManagedRepository[]> {
        const repositories = await this.registryStore.listRepositories();

        if (!options.refreshStatus) {
            return repositories;
        }

        const refreshedRepositories: ManagedRepository[] = [];
        for (const repository of repositories) {
            const refreshed = await this.refreshRepositoryHealth(repository);
            refreshedRepositories.push(refreshed);
        }

        return refreshedRepositories;
    }

    async getRepository(identifier: RepositoryIdentifier): Promise<ManagedRepository | undefined> {
        return this.resolveRepository(identifier);
    }

    async getSelectedRepository(): Promise<ManagedRepository | undefined> {
        const selectedRepoId = await this.registryStore.getSelectedRepositoryId();
        if (!selectedRepoId) {
            return undefined;
        }

        return this.registryStore.getRepositoryById(selectedRepoId);
    }

    async selectRepository(identifier: RepositoryIdentifier): Promise<ManagedRepository> {
        return this.withOperationLock(async () => {
            const repository = await this.requireRepository(identifier);
            await this.registryStore.setSelectedRepository(repository.id);
            return repository;
        });
    }

    async refreshRepository(
        identifier: RepositoryIdentifier,
        options: RefreshRepositoryOptions = {}
    ): Promise<RefreshRepositoryResult> {
        return this.withOperationLock(async () => {
            let repository = await this.requireRepository(identifier);
            const started = this.applyStatus(repository, 'indexing');
            started.lastError = undefined;
            repository = await this.registryStore.saveRepository(started);

            try {
                let hasIndex = false;
                let indexCheckError: Error | undefined;
                const allowFallback = options.allowFullReindexFallback !== false;
                const forceFullReindex = options.forceFullReindex === true;
                let incrementalFailureMessage: string | undefined;

                try {
                    hasIndex = await this.context.hasIndex(repository.path);
                } catch (error: any) {
                    indexCheckError = error instanceof Error ? error : new Error(String(error));
                    console.warn(`[RepoContextService] Failed to check index existence for ${repository.path}:`, indexCheckError.message);
                    if (allowFallback) {
                        hasIndex = false;
                        incrementalFailureMessage = this.getErrorMessage(indexCheckError);
                    } else {
                        throw indexCheckError;
                    }
                }

                if (!forceFullReindex && hasIndex) {
                    try {
                        const incrementalSyncStats = await this.context.reindexByChange(repository.path);
                        const indexed = this.applyStatus(repository, 'indexed');
                        indexed.indexedFiles = this.getUpdatedIndexedFileCount(repository.indexedFiles, incrementalSyncStats);
                        indexed.lastIndexedAt = new Date().toISOString();
                        indexed.lastSyncStats = {
                            added: incrementalSyncStats.added,
                            modified: incrementalSyncStats.modified,
                            removed: incrementalSyncStats.removed,
                            lastSyncedAt: new Date().toISOString()
                        };
                        indexed.lastError = undefined;

                        const saved = await this.registryStore.saveRepository(indexed);
                        return {
                            repository: saved,
                            mode: 'incremental',
                            fallbackToFullReindex: false,
                            incrementalSyncStats
                        };
                    } catch (incrementalError: any) {
                        incrementalFailureMessage = this.getErrorMessage(incrementalError);
                        const shouldFallback = allowFallback && await this.shouldFallbackAfterIncrementalFailure(
                            repository.path,
                            incrementalError
                        );

                        if (!shouldFallback) {
                            throw incrementalError;
                        }
                    }
                }

                const shouldForceReindex = forceFullReindex || (hasIndex && incrementalFailureMessage !== undefined);
                if (indexCheckError && !hasIndex) {
                    console.log(`[RepoContextService] Falling back to full reindex for ${repository.path} because index existence check failed.`);
                }

                const fullIndexStats = await this.context.indexCodebase(
                    repository.path,
                    undefined,
                    shouldForceReindex
                );

                const indexed = this.applyStatus(repository, 'indexed');
                indexed.indexedFiles = fullIndexStats.indexedFiles;
                indexed.indexedChunks = fullIndexStats.totalChunks;
                indexed.indexStatus = fullIndexStats.status;
                indexed.lastIndexedAt = new Date().toISOString();
                indexed.lastSyncStats = {
                    added: fullIndexStats.indexedFiles,
                    modified: 0,
                    removed: 0,
                    lastSyncedAt: new Date().toISOString()
                };
                indexed.lastError = undefined;

                const saved = await this.registryStore.saveRepository(indexed);
                return {
                    repository: saved,
                    mode: 'full',
                    fallbackToFullReindex: incrementalFailureMessage !== undefined,
                    fallbackReason: incrementalFailureMessage,
                    fullIndexStats
                };
            } catch (error: any) {
                const failed = this.applyStatus(repository, 'failed');
                failed.lastError = this.getErrorMessage(error);
                const saved = await this.registryStore.saveRepository(failed);

                throw new Error(`Failed to refresh repository '${saved.path}': ${failed.lastError}`);
            }
        });
    }

    async deleteRepositoryContext(identifier: RepositoryIdentifier): Promise<DeleteRepositoryResult> {
        return this.withOperationLock(async () => {
            const repository = await this.resolveRepository(identifier);
            if (!repository) {
                return { deleted: false };
            }

            const deleting = this.applyStatus(repository, 'deleting');
            deleting.lastError = undefined;
            await this.registryStore.saveRepository(deleting);

            try {
                await this.context.clearIndex(repository.path);
            } catch (error: any) {
                const failed = this.applyStatus(repository, 'failed');
                failed.lastError = this.getErrorMessage(error);
                await this.registryStore.saveRepository(failed);
                throw new Error(`Failed to delete repository context '${repository.path}': ${failed.lastError}`);
            }

            await this.registryStore.deleteRepository(repository.id);
            return {
                deleted: true,
                repository
            };
        });
    }

    private async refreshRepositoryHealth(repository: ManagedRepository): Promise<ManagedRepository> {
        try {
            const hasIndex = await this.context.hasIndex(repository.path);
            let nextStatus = repository.status;

            if (!hasIndex && repository.status === 'indexed') {
                nextStatus = 'stale';
            }

            if (hasIndex && (repository.status === 'stale' || repository.status === 'not_indexed')) {
                nextStatus = 'indexed';
            }

            if (nextStatus === repository.status) {
                return repository;
            }

            const updated = this.applyStatus(repository, nextStatus);
            return this.registryStore.saveRepository(updated);
        } catch {
            if (repository.status === 'failed') {
                return repository;
            }
            const failed = this.applyStatus(repository, 'failed');
            failed.lastError = 'Failed to validate repository index health';
            return this.registryStore.saveRepository(failed);
        }
    }

    private async shouldFallbackAfterIncrementalFailure(repoPath: string, error: any): Promise<boolean> {
        if (this.isFallbackEligibleError(error)) {
            return true;
        }

        const hasIndex = await this.safeHasIndex(repoPath);
        return !hasIndex;
    }

    private isFallbackEligibleError(error: any): boolean {
        const message = this.getErrorMessage(error).toLowerCase();
        const fallbackSignals = [
            'failed to query milvus',
            'failed to query collection',
            'collection not found',
            'does not exist',
            'not found in milvus',
            'failed to delete',
            'collection has been dropped'
        ];

        return fallbackSignals.some(signal => message.includes(signal));
    }

    private async safeHasIndex(repoPath: string): Promise<boolean> {
        try {
            return await this.context.hasIndex(repoPath);
        } catch {
            return false;
        }
    }

    private getErrorMessage(error: any): string {
        if (error instanceof Error && error.message) {
            return error.message;
        }
        return String(error);
    }

    private getUpdatedIndexedFileCount(
        currentCount: number,
        stats: { added: number; removed: number; modified: number }
    ): number {
        const updatedCount = currentCount + stats.added - stats.removed;
        return Math.max(0, updatedCount);
    }

    private async resolveAndValidateRepoPath(inputPath: string): Promise<string> {
        const absolutePath = path.resolve(inputPath);
        const stat = await fs.stat(absolutePath);
        if (!stat.isDirectory()) {
            throw new Error(`Path '${absolutePath}' is not a directory`);
        }
        return absolutePath;
    }

    private buildRepositoryRecord(repoPath: string, existing?: ManagedRepository): ManagedRepository {
        const now = new Date().toISOString();
        return {
            id: this.createRepositoryId(repoPath),
            name: path.basename(repoPath),
            path: repoPath,
            collectionName: this.context.getCollectionName(repoPath),
            status: existing?.status || 'not_indexed',
            indexedFiles: existing?.indexedFiles || 0,
            indexedChunks: existing?.indexedChunks || 0,
            indexStatus: existing?.indexStatus,
            lastIndexedAt: existing?.lastIndexedAt,
            lastError: existing?.lastError,
            lastSyncStats: existing?.lastSyncStats,
            createdAt: existing?.createdAt || now,
            updatedAt: now
        };
    }

    private createRepositoryId(repoPath: string): string {
        const normalizedPath = path.resolve(repoPath);
        return crypto.createHash('md5').update(normalizedPath).digest('hex');
    }

    private applyStatus(repository: ManagedRepository, status: RepositoryStatus): ManagedRepository {
        return {
            ...repository,
            status,
            updatedAt: new Date().toISOString()
        };
    }

    private async resolveRepository(identifier: RepositoryIdentifier): Promise<ManagedRepository | undefined> {
        if (identifier.repoId) {
            return this.registryStore.getRepositoryById(identifier.repoId);
        }

        if (identifier.path) {
            const absolutePath = path.resolve(identifier.path);
            return this.registryStore.getRepositoryByPath(absolutePath);
        }

        return undefined;
    }

    private async requireRepository(identifier: RepositoryIdentifier): Promise<ManagedRepository> {
        const repository = await this.resolveRepository(identifier);
        if (!repository) {
            throw new Error('Repository not found in local registry');
        }
        return repository;
    }

    private async withOperationLock<T>(operation: () => Promise<T>): Promise<T> {
        const previous = this.operationQueue;
        let release: () => void = () => { };
        this.operationQueue = new Promise<void>(resolve => {
            release = resolve;
        });

        await previous.catch(() => undefined);
        try {
            return await operation();
        } finally {
            release();
        }
    }
}
