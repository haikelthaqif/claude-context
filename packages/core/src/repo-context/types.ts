import { ManagedRepository } from '../repo-registry/types';

export interface AddRepositoryOptions {
    indexNow?: boolean;
    forceReindex?: boolean;
}

export interface RefreshRepositoryOptions {
    forceFullReindex?: boolean;
    allowFullReindexFallback?: boolean;
}

export interface ListRepositoriesOptions {
    refreshStatus?: boolean;
}

export interface RepositoryIdentifier {
    repoId?: string;
    path?: string;
}

export interface RefreshRepositoryResult {
    repository: ManagedRepository;
    mode: 'full' | 'incremental';
    fallbackToFullReindex: boolean;
    fallbackReason?: string;
    fullIndexStats?: {
        indexedFiles: number;
        totalChunks: number;
        status: 'completed' | 'limit_reached';
    };
    incrementalSyncStats?: {
        added: number;
        removed: number;
        modified: number;
    };
}

export interface DeleteRepositoryResult {
    deleted: boolean;
    repository?: ManagedRepository;
}
