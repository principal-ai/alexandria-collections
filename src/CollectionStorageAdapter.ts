/**
 * CollectionStorageAdapter
 *
 * A storage adapter for managing collections and memberships using a FileSystemAdapter.
 * Each collection is stored in a separate file: collections/{id}.json
 * Memberships are embedded within each collection file.
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
  CollectionFile,
} from './types.js';
import { context, trace, Tracer, SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from './telemetry.js';

export interface CollectionStorageOptions {
  /**
   * Directory name for storing collections
   * @default 'collections'
   */
  collectionsDir?: string;

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

  /**
   * OpenTelemetry instrumentation configuration
   * @default { enabled: false }
   */
  telemetry?: {
    /** Enable OpenTelemetry tracing */
    enabled: boolean;
    /** Optional service name override */
    serviceName?: string;
  };
}

interface ResolvedCollectionStorageOptions {
  collectionsDir: string;
  prettyPrint: boolean;
  version: string;
}

export class CollectionStorageAdapter {
  private rootPath: string;
  private adapter: FileSystemAdapter;
  private options: ResolvedCollectionStorageOptions;
  private tracer: Tracer;

  constructor(
    rootPath: string,
    adapter: FileSystemAdapter,
    options: CollectionStorageOptions = {}
  ) {
    this.rootPath = rootPath;
    this.adapter = adapter;
    this.options = {
      collectionsDir: options.collectionsDir ?? 'collections',
      prettyPrint: options.prettyPrint ?? true,
      version: options.version ?? '1.0',
    };
    this.tracer = getTracer(
      options.telemetry?.enabled ?? false,
      options.telemetry?.serviceName
    );
  }

  // ============================================================================
  // Path Helpers
  // ============================================================================

  private getCollectionsDirPath(): string {
    return this.adapter.join(this.rootPath, this.options.collectionsDir);
  }

  private getCollectionFilePath(id: string): string {
    return this.adapter.join(this.getCollectionsDirPath(), `${id}.json`);
  }

  // ============================================================================
  // Low-Level File Operations
  // ============================================================================

  /**
   * Ensure collections directory exists
   */
  private ensureCollectionsDir(): void {
    const dirPath = this.getCollectionsDirPath();
    const exists = this.adapter.exists(dirPath);
    if (!exists) {
      this.adapter.createDir(dirPath);
    }
  }

  /**
   * Read and parse a single collection file
   */
  private async readCollectionFile(id: string): Promise<Collection | undefined> {
    const path = this.getCollectionFilePath(id);
    const activeSpan = trace.getActiveSpan();

    try {
      const exists = await this.adapter.exists(path);
      if (!exists) {
        activeSpan?.addEvent('storage.file.read', {
          'file.name': `${id}.json`,
          'file.type': 'collection',
          'result.found': false,
        });
        return undefined;
      }

      const content = await this.adapter.readFile(path);
      const data: CollectionFile = JSON.parse(content);

      activeSpan?.addEvent('storage.file.read', {
        'file.name': `${id}.json`,
        'file.type': 'collection',
        'result.found': true,
        'result.memberCount': data.collection.members?.length ?? 0,
      });

      return data.collection;
    } catch (error) {
      console.error(`Failed to read collection file ${id}:`, error);
      return undefined;
    }
  }

  /**
   * Read all collection files from the directory
   */
  private async readAllCollectionFiles(): Promise<Collection[]> {
    const activeSpan = trace.getActiveSpan();

    try {
      const dirPath = this.getCollectionsDirPath();
      const exists = await this.adapter.exists(dirPath);

      if (!exists) {
        activeSpan?.addEvent('storage.directory.read', {
          'directory.name': this.options.collectionsDir,
          'result.count': 0,
        });
        return [];
      }

      const files = this.adapter.readDir(dirPath);
      const jsonFiles = files.filter((f: string) => f.endsWith('.json'));

      const collections: Collection[] = [];
      for (const file of jsonFiles) {
        const id = file.replace('.json', '');
        const collection = await this.readCollectionFile(id);
        if (collection) {
          collections.push(collection);
        }
      }

      activeSpan?.addEvent('storage.directory.read', {
        'directory.name': this.options.collectionsDir,
        'result.count': collections.length,
      });

      return collections;
    } catch (error) {
      console.error('Failed to read collections directory:', error);
      return [];
    }
  }

  /**
   * Write a collection to its file
   */
  private async writeCollectionFile(collection: Collection): Promise<void> {
    const activeSpan = trace.getActiveSpan();

    this.ensureCollectionsDir();

    const path = this.getCollectionFilePath(collection.id);
    const data: CollectionFile = {
      version: this.options.version,
      collection,
    };

    const content = this.options.prettyPrint
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);

    await this.adapter.writeFile(path, content);

    activeSpan?.addEvent('storage.file.write', {
      'file.name': `${collection.id}.json`,
      'file.type': 'collection',
      'members.count': collection.members.length,
    });
  }

  /**
   * Delete a collection file
   */
  private async deleteCollectionFile(id: string): Promise<void> {
    const path = this.getCollectionFilePath(id);
    const exists = await this.adapter.exists(path);

    if (exists) {
      await this.adapter.deleteFile(path);
    }
  }

  // ============================================================================
  // Collection CRUD Operations
  // ============================================================================

  /**
   * Get all collections
   */
  async getCollections(): Promise<Collection[]> {
    const span = this.tracer.startSpan('collection.get');

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const startTime = Date.now();
        const collections = await this.readAllCollectionFiles();

        span.setAttributes({
          'output.count': collections.length,
          'duration.ms': Date.now() - startTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return collections;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get a single collection by ID
   */
  async getCollection(id: string): Promise<Collection | undefined> {
    const span = this.tracer.startSpan('collection.get', {
      attributes: {
        'input.collectionId': id,
      },
    });

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const startTime = Date.now();
        const result = await this.readCollectionFile(id);

        span.setAttributes({
          'output.count': result ? 1 : 0,
          'duration.ms': Date.now() - startTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
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
    const span = this.tracer.startSpan('collection.create', {
      attributes: {
        'input.name': input.name,
        ...(input.description && { 'input.description': input.description }),
      },
    });

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const startTime = Date.now();
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
          members: [],
          createdAt: now,
          updatedAt: now,
        };

        await this.writeCollectionFile(newCollection);

        span.setAttributes({
          'output.collectionId': id,
          'output.name': input.name,
          'duration.ms': Date.now() - startTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return newCollection;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Update an existing collection
   */
  async updateCollection(
    id: string,
    updates: Partial<Omit<Collection, 'id' | 'createdAt' | 'members'>>
  ): Promise<Collection> {
    const span = this.tracer.startSpan('collection.update', {
      attributes: {
        'input.collectionId': id,
        'input.hasNameUpdate': updates.name !== undefined,
      },
    });

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const startTime = Date.now();
        const existing = await this.readCollectionFile(id);

        if (!existing) {
          throw new Error(`Collection not found: ${id}`);
        }

        const updated: Collection = {
          ...existing,
          ...updates,
          id: existing.id, // Never allow ID to change
          createdAt: existing.createdAt, // Never allow createdAt to change
          members: existing.members, // Never allow members to change via update
          updatedAt: Date.now(),
        };

        await this.writeCollectionFile(updated);

        span.setAttributes({
          'output.updatedAt': updated.updatedAt,
          'duration.ms': Date.now() - startTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return updated;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Delete a collection and all its memberships
   */
  async deleteCollection(id: string): Promise<void> {
    const span = this.tracer.startSpan('collection.delete', {
      attributes: {
        'input.collectionId': id,
      },
    });

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const startTime = Date.now();
        const existing = await this.readCollectionFile(id);

        if (!existing) {
          throw new Error(`Collection not found: ${id}`);
        }

        const memberCount = existing.members.length;
        await this.deleteCollectionFile(id);

        span.setAttributes({
          'output.membershipsCascadeDeleted': memberCount,
          'duration.ms': Date.now() - startTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  // ============================================================================
  // Membership Operations
  // ============================================================================

  /**
   * Get all memberships across all collections
   */
  async getAllMemberships(): Promise<CollectionMembership[]> {
    const span = this.tracer.startSpan('membership.get');

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const startTime = Date.now();
        const collections = await this.readAllCollectionFiles();
        const allMemberships = collections.flatMap(c => c.members);

        span.setAttributes({
          'output.count': allMemberships.length,
          'duration.ms': Date.now() - startTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return allMemberships;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get all memberships for a specific collection
   */
  async getCollectionMemberships(collectionId: string): Promise<CollectionMembership[]> {
    const span = this.tracer.startSpan('membership.get', {
      attributes: {
        'input.collectionId': collectionId,
      },
    });

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const startTime = Date.now();
        const collection = await this.readCollectionFile(collectionId);
        const members = collection?.members ?? [];

        span.setAttributes({
          'output.count': members.length,
          'duration.ms': Date.now() - startTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return members;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get all memberships for a specific repository
   */
  async getRepositoryMemberships(repositoryId: string): Promise<CollectionMembership[]> {
    const span = this.tracer.startSpan('membership.get', {
      attributes: {
        'input.repositoryId': repositoryId,
      },
    });

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const startTime = Date.now();
        const collections = await this.readAllCollectionFiles();
        const memberships = collections.flatMap(c =>
          c.members.filter(m => m.repositoryId === repositoryId)
        );

        span.setAttributes({
          'output.count': memberships.length,
          'duration.ms': Date.now() - startTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return memberships;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get a specific membership
   */
  async getMembership(
    collectionId: string,
    repositoryId: string
  ): Promise<CollectionMembership | undefined> {
    const span = this.tracer.startSpan('membership.get', {
      attributes: {
        'input.collectionId': collectionId,
        'input.repositoryId': repositoryId,
      },
    });

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const startTime = Date.now();
        const collection = await this.readCollectionFile(collectionId);
        const result = collection?.members.find(m => m.repositoryId === repositoryId);

        span.setAttributes({
          'output.count': result ? 1 : 0,
          'duration.ms': Date.now() - startTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Add a repository to a collection
   */
  async addRepository(
    collectionId: string,
    repositoryId: string,
    metadata?: Record<string, unknown>
  ): Promise<CollectionMembership> {
    const span = this.tracer.startSpan('repository.add', {
      attributes: {
        'input.collectionId': collectionId,
        'input.repositoryId': repositoryId,
      },
    });

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const startTime = Date.now();

        // Verify collection exists
        const collection = await this.readCollectionFile(collectionId);
        if (!collection) {
          throw new Error(`Collection not found: ${collectionId}`);
        }

        // Check if membership already exists
        const existing = collection.members.find(
          m => m.repositoryId === repositoryId
        );

        if (existing) {
          span.setAttributes({
            'output.alreadyExisted': true,
            'duration.ms': Date.now() - startTime,
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return existing;
        }

        const newMembership: CollectionMembership = {
          repositoryId,
          collectionId,
          addedAt: Date.now(),
          metadata,
        };

        collection.members.push(newMembership);
        collection.updatedAt = Date.now();
        await this.writeCollectionFile(collection);

        span.setAttributes({
          'output.alreadyExisted': false,
          'duration.ms': Date.now() - startTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return newMembership;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Remove a repository from a collection
   */
  async removeRepository(collectionId: string, repositoryId: string): Promise<void> {
    const span = this.tracer.startSpan('repository.remove', {
      attributes: {
        'input.collectionId': collectionId,
        'input.repositoryId': repositoryId,
      },
    });

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const startTime = Date.now();
        const collection = await this.readCollectionFile(collectionId);

        if (!collection) {
          throw new Error(`Collection not found: ${collectionId}`);
        }

        const initialLength = collection.members.length;
        collection.members = collection.members.filter(
          m => m.repositoryId !== repositoryId
        );

        const wasPresent = collection.members.length < initialLength;

        if (!wasPresent) {
          span.setAttributes({
            'output.wasPresent': false,
            'duration.ms': Date.now() - startTime,
          });
          span.setStatus({ code: SpanStatusCode.OK });
          return;
        }

        collection.updatedAt = Date.now();
        await this.writeCollectionFile(collection);

        span.setAttributes({
          'output.wasPresent': true,
          'duration.ms': Date.now() - startTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Update membership metadata
   */
  async updateMembershipMetadata(
    collectionId: string,
    repositoryId: string,
    metadata: Record<string, unknown>
  ): Promise<CollectionMembership> {
    const span = this.tracer.startSpan('membership.metadata.update', {
      attributes: {
        'input.collectionId': collectionId,
        'input.repositoryId': repositoryId,
        'input.metadataKeys': Object.keys(metadata).join(','),
      },
    });

    return await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const startTime = Date.now();
        const collection = await this.readCollectionFile(collectionId);

        if (!collection) {
          throw new Error(`Collection not found: ${collectionId}`);
        }

        const memberIndex = collection.members.findIndex(
          m => m.repositoryId === repositoryId
        );

        if (memberIndex === -1) {
          throw new Error(
            `Membership not found: ${repositoryId} in collection ${collectionId}`
          );
        }

        const updated: CollectionMembership = {
          ...collection.members[memberIndex]!,
          metadata,
        };

        collection.members[memberIndex] = updated;
        collection.updatedAt = Date.now();
        await this.writeCollectionFile(collection);

        span.setAttributes({
          'duration.ms': Date.now() - startTime,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return updated;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        throw error;
      } finally {
        span.end();
      }
    });
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
   * Check if collections directory exists
   */
  async exists(): Promise<boolean> {
    const path = this.getCollectionsDirPath();
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
    const collections = await this.readAllCollectionFiles();
    const membershipsCount = collections.reduce((sum, c) => sum + c.members.length, 0);

    return {
      collectionsCount: collections.length,
      membershipsCount,
      averageMembershipsPerCollection:
        collections.length > 0 ? membershipsCount / collections.length : 0,
    };
  }
}
