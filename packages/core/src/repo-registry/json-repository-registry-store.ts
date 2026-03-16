import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ManagedRepository, RepositoryRegistryState } from './types';

const DEFAULT_REGISTRY_FILE = path.join(os.homedir(), '.context', 'repo-registry.json');

export class JsonRepositoryRegistryStore {
    private readonly filePath: string;
    private mutationQueue: Promise<void> = Promise.resolve();

    constructor(filePath?: string) {
        this.filePath = filePath || process.env.CONTEXT_REPO_REGISTRY_PATH || DEFAULT_REGISTRY_FILE;
    }

    getFilePath(): string {
        return this.filePath;
    }

    async listRepositories(): Promise<ManagedRepository[]> {
        const state = await this.readState();
        return state.repositories
            .slice()
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    async getRepositoryById(repoId: string): Promise<ManagedRepository | undefined> {
        const state = await this.readState();
        return state.repositories.find(repo => repo.id === repoId);
    }

    async getRepositoryByPath(repoPath: string): Promise<ManagedRepository | undefined> {
        const state = await this.readState();
        const normalized = this.normalizePathForComparison(repoPath);
        return state.repositories.find(repo => this.normalizePathForComparison(repo.path) === normalized);
    }

    async saveRepository(repository: ManagedRepository): Promise<ManagedRepository> {
        return this.withMutationLock(async () => {
            const state = await this.readState();
            const indexById = state.repositories.findIndex(repo => repo.id === repository.id);
            const indexByPath = state.repositories.findIndex(
                repo => this.normalizePathForComparison(repo.path) === this.normalizePathForComparison(repository.path)
            );
            const targetIndex = indexById >= 0 ? indexById : indexByPath;

            if (targetIndex >= 0) {
                state.repositories[targetIndex] = repository;
            } else {
                state.repositories.push(repository);
            }

            state.lastUpdated = new Date().toISOString();
            await this.writeState(state);
            return repository;
        });
    }

    async deleteRepository(repoId: string): Promise<boolean> {
        return this.withMutationLock(async () => {
            const state = await this.readState();
            const originalSize = state.repositories.length;
            state.repositories = state.repositories.filter(repo => repo.id !== repoId);

            if (state.selectedRepoId === repoId) {
                delete state.selectedRepoId;
            }

            if (state.repositories.length === originalSize) {
                return false;
            }

            state.lastUpdated = new Date().toISOString();
            await this.writeState(state);
            return true;
        });
    }

    async setSelectedRepository(repoId?: string): Promise<void> {
        await this.withMutationLock(async () => {
            const state = await this.readState();
            if (repoId) {
                state.selectedRepoId = repoId;
            } else {
                delete state.selectedRepoId;
            }

            state.lastUpdated = new Date().toISOString();
            await this.writeState(state);
        });
    }

    async getSelectedRepositoryId(): Promise<string | undefined> {
        const state = await this.readState();
        return state.selectedRepoId;
    }

    private async readState(): Promise<RepositoryRegistryState> {
        try {
            const data = await fs.readFile(this.filePath, 'utf-8');
            const parsed = JSON.parse(data) as RepositoryRegistryState;
            if (parsed.formatVersion !== 'v1' || !Array.isArray(parsed.repositories)) {
                return this.createEmptyState();
            }
            return parsed;
        } catch (error: any) {
            if (error?.code === 'ENOENT') {
                return this.createEmptyState();
            }
            throw error;
        }
    }

    private async writeState(state: RepositoryRegistryState): Promise<void> {
        const parent = path.dirname(this.filePath);
        await fs.mkdir(parent, { recursive: true });

        const tempFilePath = `${this.filePath}.tmp`;
        await fs.writeFile(tempFilePath, JSON.stringify(state, null, 2), 'utf-8');
        await fs.rename(tempFilePath, this.filePath);
    }

    private createEmptyState(): RepositoryRegistryState {
        return {
            formatVersion: 'v1',
            repositories: [],
            lastUpdated: new Date().toISOString()
        };
    }

    private async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
        const previous = this.mutationQueue;
        let release: () => void = () => { };
        this.mutationQueue = new Promise<void>(resolve => {
            release = resolve;
        });

        await previous.catch(() => undefined);
        try {
            return await operation();
        } finally {
            release();
        }
    }

    private normalizePathForComparison(inputPath: string): string {
        const resolved = path.resolve(inputPath);
        return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    }
}
