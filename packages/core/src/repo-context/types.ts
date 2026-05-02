import { ManagedRepository } from '../repo-registry/types';

export interface RepositoryProgress {
    phase: string;
    current: number;
    total: number;
    percentage: number;
}

export interface AddRepositoryOptions {
    indexNow?: boolean;
    forceReindex?: boolean;
    progressCallback?: (progress: RepositoryProgress) => void;
}

export interface RefreshRepositoryOptions {
    forceFullReindex?: boolean;
    allowFullReindexFallback?: boolean;
    progressCallback?: (progress: RepositoryProgress) => void;
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
