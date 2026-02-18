/**
 * CollectionStorageAdapter
 *
 * A storage adapter for managing collections and memberships using a FileSystemAdapter.
 * This provides a centralized, reusable way to handle collection persistence across
 * different storage backends (GitHub, localStorage, private storage, etc.).
 *
 * @example
 * ```typescript
 * import { CollectionStorageAdapter } from '@principal-ai/alexandria-collections';
 * import { NodeFileSystemAdapter } from '@principal-ai/repository-abstraction/node';
 *
 * const fs = new NodeFileSystemAdapter();
 * const storage = new CollectionStorageAdapter('/', fs);
 *
 * // Create a collection
 * const collection = await storage.createCollection({
 *   name: 'My Projects',
 *   description: 'Personal projects'
 * });
 *
 * // Add a repository
 * await storage.addRepository(collection.id, 'owner/repo');
 * ```
 */

import type { FileSystemAdapter } from '@principal-ai/repository-abstraction';
import type {
  Collection,
  CollectionMembership,
  CollectionsData,
  CollectionMembershipsData,
} from './types.js';

export interface CollectionStorageOptions {
  /**
   * File names for storage
   * @default { collections: 'collections.json', memberships: 'collection-memberships.json' }
   */
  fileNames?: {
    collections?: string;
    memberships?: string;
  };

  /**
   * Whether to pretty-print JSON output
   * @default true
   */
  prettyPrint?: boolean;

  /**
   * Data version to use
   * @default '1.0'
   */
  version?: string;
}

interface ResolvedCollectionStorageOptions {
  fileNames: {
    collections: string;
    memberships: string;
  };
  prettyPrint: boolean;
  version: string;
}

export class CollectionStorageAdapter {
  private rootPath: string;
  private adapter: FileSystemAdapter;
  private options: ResolvedCollectionStorageOptions;

  constructor(
    rootPath: string,
    adapter: FileSystemAdapter,
    options: CollectionStorageOptions = {}
  ) {
    this.rootPath = rootPath;
    this.adapter = adapter;
    this.options = {
      fileNames: {
        collections: options.fileNames?.collections ?? 'collections.json',
        memberships: options.fileNames?.memberships ?? 'collection-memberships.json',
      },
      prettyPrint: options.prettyPrint ?? true,
      version: options.version ?? '1.0',
    };
  }

  // ============================================================================
  // Path Helpers
  // ============================================================================

  private getCollectionsPath(): string {
    return this.adapter.join(this.rootPath, this.options.fileNames.collections);
  }

  private getMembershipsPath(): string {
    return this.adapter.join(this.rootPath, this.options.fileNames.memberships);
  }

  // ============================================================================
  // Low-Level File Operations
  // ============================================================================

  /**
   * Read and parse the collections file
   */
  private async readCollectionsFile(): Promise<CollectionsData> {
    const path = this.getCollectionsPath();
    try {
      const exists = await this.adapter.exists(path);
      if (!exists) {
        return { version: this.options.version, collections: [] };
      }
      const content = await this.adapter.readFile(path);
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to read collections file:', error);
      return { version: this.options.version, collections: [] };
    }
  }

  /**
   * Read and parse the memberships file
   */
  private async readMembershipsFile(): Promise<CollectionMembershipsData> {
    const path = this.getMembershipsPath();
    try {
      const exists = await this.adapter.exists(path);
      if (!exists) {
        return { version: this.options.version, memberships: [] };
      }
      const content = await this.adapter.readFile(path);
      return JSON.parse(content);
    } catch (error) {
      console.error('Failed to read memberships file:', error);
      return { version: this.options.version, memberships: [] };
    }
  }

  /**
   * Write collections to file
   */
  private async writeCollectionsFile(collections: Collection[]): Promise<void> {
    const path = this.getCollectionsPath();
    const data: CollectionsData = {
      version: this.options.version,
      collections,
    };
    const content = this.options.prettyPrint
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);
    await this.adapter.writeFile(path, content);
  }

  /**
   * Write memberships to file
   */
  private async writeMembershipsFile(memberships: CollectionMembership[]): Promise<void> {
    const path = this.getMembershipsPath();
    const data: CollectionMembershipsData = {
      version: this.options.version,
      memberships,
    };
    const content = this.options.prettyPrint
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);
    await this.adapter.writeFile(path, content);
  }

  // ============================================================================
  // Collection CRUD Operations
  // ============================================================================

  /**
   * Get all collections
   */
  async getCollections(): Promise<Collection[]> {
    const data = await this.readCollectionsFile();
    return data.collections;
  }

  /**
   * Get a single collection by ID
   */
  async getCollection(id: string): Promise<Collection | undefined> {
    const collections = await this.getCollections();
    return collections.find((c) => c.id === id);
  }

  /**
   * Create a new collection
   */
  async createCollection(input: {
    name: string;
    description?: string;
    icon?: string;
    theme?: string;
    isDefault?: boolean;
    suggestedClonePath?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Collection> {
    const collections = await this.getCollections();
    const now = Date.now();
    const id = this.generateCollectionId();

    const newCollection: Collection = {
      id,
      name: input.name,
      description: input.description,
      icon: input.icon,
      theme: input.theme,
      isDefault: input.isDefault,
      suggestedClonePath: input.suggestedClonePath,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };

    collections.push(newCollection);
    await this.writeCollectionsFile(collections);

    return newCollection;
  }

  /**
   * Update an existing collection
   */
  async updateCollection(
    id: string,
    updates: Partial<Omit<Collection, 'id' | 'createdAt'>>
  ): Promise<Collection> {
    const collections = await this.getCollections();
    const index = collections.findIndex((c) => c.id === id);

    if (index === -1) {
      throw new Error(`Collection not found: ${id}`);
    }

    const existing = collections[index]!;
    const updated: Collection = {
      ...existing,
      ...updates,
      id: existing.id, // Never allow ID to change
      createdAt: existing.createdAt, // Never allow createdAt to change
      updatedAt: Date.now(),
    };

    collections[index] = updated;
    await this.writeCollectionsFile(collections);

    return updated;
  }

  /**
   * Delete a collection and all its memberships
   */
  async deleteCollection(id: string): Promise<void> {
    const collections = await this.getCollections();
    const filtered = collections.filter((c) => c.id !== id);

    if (filtered.length === collections.length) {
      throw new Error(`Collection not found: ${id}`);
    }

    await this.writeCollectionsFile(filtered);

    // Cascade delete: remove all memberships for this collection
    const memberships = await this.getAllMemberships();
    const filteredMemberships = memberships.filter((m) => m.collectionId !== id);
    await this.writeMembershipsFile(filteredMemberships);
  }

  // ============================================================================
  // Membership Operations
  // ============================================================================

  /**
   * Get all memberships across all collections
   */
  async getAllMemberships(): Promise<CollectionMembership[]> {
    const data = await this.readMembershipsFile();
    return data.memberships;
  }

  /**
   * Get all memberships for a specific collection
   */
  async getCollectionMemberships(collectionId: string): Promise<CollectionMembership[]> {
    const memberships = await this.getAllMemberships();
    return memberships.filter((m) => m.collectionId === collectionId);
  }

  /**
   * Get all memberships for a specific repository
   */
  async getRepositoryMemberships(repositoryId: string): Promise<CollectionMembership[]> {
    const memberships = await this.getAllMemberships();
    return memberships.filter((m) => m.repositoryId === repositoryId);
  }

  /**
   * Get a specific membership
   */
  async getMembership(
    collectionId: string,
    repositoryId: string
  ): Promise<CollectionMembership | undefined> {
    const memberships = await this.getAllMemberships();
    return memberships.find(
      (m) => m.collectionId === collectionId && m.repositoryId === repositoryId
    );
  }

  /**
   * Add a repository to a collection
   */
  async addRepository(
    collectionId: string,
    repositoryId: string,
    metadata?: Record<string, unknown>
  ): Promise<CollectionMembership> {
    // Verify collection exists
    const collection = await this.getCollection(collectionId);
    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    const memberships = await this.getAllMemberships();

    // Check if membership already exists
    const existing = memberships.find(
      (m) => m.repositoryId === repositoryId && m.collectionId === collectionId
    );

    if (existing) {
      return existing;
    }

    const newMembership: CollectionMembership = {
      repositoryId,
      collectionId,
      addedAt: Date.now(),
      metadata,
    };

    memberships.push(newMembership);
    await this.writeMembershipsFile(memberships);

    return newMembership;
  }

  /**
   * Remove a repository from a collection
   */
  async removeRepository(collectionId: string, repositoryId: string): Promise<void> {
    const memberships = await this.getAllMemberships();
    const filtered = memberships.filter(
      (m) => !(m.repositoryId === repositoryId && m.collectionId === collectionId)
    );

    if (filtered.length === memberships.length) {
      // Membership didn't exist, but that's okay
      return;
    }

    await this.writeMembershipsFile(filtered);
  }

  /**
   * Update membership metadata
   */
  async updateMembershipMetadata(
    collectionId: string,
    repositoryId: string,
    metadata: Record<string, unknown>
  ): Promise<CollectionMembership> {
    const memberships = await this.getAllMemberships();
    const index = memberships.findIndex(
      (m) => m.collectionId === collectionId && m.repositoryId === repositoryId
    );

    if (index === -1) {
      throw new Error(
        `Membership not found: ${repositoryId} in collection ${collectionId}`
      );
    }

    const updated: CollectionMembership = {
      ...memberships[index]!,
      metadata,
    };

    memberships[index] = updated;
    await this.writeMembershipsFile(memberships);

    return updated;
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Import collections and memberships from external source.
   *
   * @param importCollections - Collections to import
   * @param importMemberships - Memberships to import
   * @param strategy - How to handle conflicts:
   *   - 'replace': Replace all local data with imported data (default)
   *   - 'merge': Add new items, keep existing ones
   *   - 'merge-update': Add new items and update existing ones by ID
   */
  async importData(
    importCollections: Collection[],
    importMemberships: CollectionMembership[],
    strategy: 'replace' | 'merge' | 'merge-update' = 'replace'
  ): Promise<void> {
    if (strategy === 'replace') {
      // Replace mode: imported data is source of truth
      await this.writeCollectionsFile(importCollections);
      await this.writeMembershipsFile(importMemberships);
      return;
    }

    const existingCollections = await this.getCollections();
    const existingMemberships = await this.getAllMemberships();

    if (strategy === 'merge') {
      // Merge mode: add new items, keep existing
      const existingIds = new Set(existingCollections.map((c) => c.id));
      const newCollections = importCollections.filter((c) => !existingIds.has(c.id));
      const mergedCollections = [...existingCollections, ...newCollections];

      const existingMembershipKeys = new Set(
        existingMemberships.map((m) => `${m.collectionId}:${m.repositoryId}`)
      );
      const newMemberships = importMemberships.filter(
        (m) => !existingMembershipKeys.has(`${m.collectionId}:${m.repositoryId}`)
      );
      const mergedMemberships = [...existingMemberships, ...newMemberships];

      await this.writeCollectionsFile(mergedCollections);
      await this.writeMembershipsFile(mergedMemberships);
    } else if (strategy === 'merge-update') {
      // Merge-update mode: add new items and update existing ones
      const existingMap = new Map(existingCollections.map((c) => [c.id, c]));
      const mergedCollections = [...existingCollections];

      for (const imported of importCollections) {
        const existingIndex = mergedCollections.findIndex((c) => c.id === imported.id);
        if (existingIndex === -1) {
          mergedCollections.push(imported);
        } else {
          mergedCollections[existingIndex] = imported;
        }
      }

      const existingMembershipMap = new Map(
        existingMemberships.map((m) => [`${m.collectionId}:${m.repositoryId}`, m])
      );
      const mergedMemberships = [...existingMemberships];

      for (const imported of importMemberships) {
        const key = `${imported.collectionId}:${imported.repositoryId}`;
        const existingIndex = mergedMemberships.findIndex(
          (m) => `${m.collectionId}:${m.repositoryId}` === key
        );
        if (existingIndex === -1) {
          mergedMemberships.push(imported);
        } else {
          mergedMemberships[existingIndex] = imported;
        }
      }

      await this.writeCollectionsFile(mergedCollections);
      await this.writeMembershipsFile(mergedMemberships);
    }
  }

  /**
   * Export all collections and memberships
   */
  async exportData(): Promise<{
    collections: Collection[];
    memberships: CollectionMembership[];
  }> {
    const [collections, memberships] = await Promise.all([
      this.getCollections(),
      this.getAllMemberships(),
    ]);

    return { collections, memberships };
  }

  /**
   * Clear all collections and memberships
   */
  async clear(): Promise<void> {
    await this.writeCollectionsFile([]);
    await this.writeMembershipsFile([]);
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Generate a unique collection ID
   */
  private generateCollectionId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `col-${timestamp}-${random}`;
  }

  /**
   * Check if collections file exists
   */
  async exists(): Promise<boolean> {
    const path = this.getCollectionsPath();
    return this.adapter.exists(path);
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    collectionsCount: number;
    membershipsCount: number;
    averageMembershipsPerCollection: number;
  }> {
    const [collections, memberships] = await Promise.all([
      this.getCollections(),
      this.getAllMemberships(),
    ]);

    return {
      collectionsCount: collections.length,
      membershipsCount: memberships.length,
      averageMembershipsPerCollection:
        collections.length > 0 ? memberships.length / collections.length : 0,
    };
  }
}
