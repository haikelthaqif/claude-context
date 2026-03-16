export type RepositoryStatus =
    | 'not_indexed'
    | 'indexing'
    | 'indexed'
    | 'stale'
    | 'failed'
    | 'deleting';

export interface RepositorySyncStats {
    added: number;
    modified: number;
    removed: number;
    lastSyncedAt: string;
}

export interface ManagedRepository {
    id: string;
    name: string;
    path: string;
    collectionName: string;
    status: RepositoryStatus;
    indexedFiles: number;
    indexedChunks: number;
    indexStatus?: 'completed' | 'limit_reached';
    lastIndexedAt?: string;
    lastError?: string;
    lastSyncStats?: RepositorySyncStats;
    createdAt: string;
    updatedAt: string;
}

export interface RepositoryRegistryState {
    formatVersion: 'v1';
    selectedRepoId?: string;
    repositories: ManagedRepository[];
    lastUpdated: string;
}

