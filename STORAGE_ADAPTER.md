# CollectionStorageAdapter

A centralized storage adapter for managing collections and memberships across different storage backends.

## Overview

The `CollectionStorageAdapter` provides a unified interface for collection persistence that works with any storage backend through the `FileSystemAdapter` interface from `@principal-ai/repository-abstraction`.

## Features

- **Storage Backend Agnostic**: Works with GitHub, localStorage, file system, or any custom adapter
- **Full CRUD Operations**: Create, read, update, and delete collections and memberships
- **Bulk Operations**: Import/export with multiple merge strategies
- **Type-Safe**: Full TypeScript support with proper types
- **Flexible**: Customizable file names, formatting, and version control

## Installation

```bash
npm install @principal-ai/alexandria-collections @principal-ai/repository-abstraction
```

## Usage Examples

### Basic Usage with Node.js File System

```typescript
import { CollectionStorageAdapter } from '@principal-ai/alexandria-collections';
import { NodeFileSystemAdapter } from '@principal-ai/repository-abstraction/node';

// Create adapter
const fs = new NodeFileSystemAdapter();
const storage = new CollectionStorageAdapter('/path/to/data', fs);

// Create a collection
const collection = await storage.createCollection({
  name: 'My Projects',
  description: 'Personal coding projects',
  icon: 'folder',
});

// Add repositories
await storage.addRepository(collection.id, 'facebook/react');
await storage.addRepository(collection.id, 'microsoft/vscode');

// Get all collections
const collections = await storage.getCollections();

// Get memberships for a collection
const repos = await storage.getCollectionMemberships(collection.id);
```

### Browser Usage with localStorage

```typescript
import { CollectionStorageAdapter } from '@principal-ai/alexandria-collections';
import { LocalStorageFileSystemAdapter } from '@your-app/adapters';

const fs = new LocalStorageFileSystemAdapter();
const storage = new CollectionStorageAdapter('/', fs);

// Same API works in the browser!
const collection = await storage.createCollection({
  name: 'Favorites',
  description: 'My favorite repos',
});
```

### GitHub Storage

```typescript
import { CollectionStorageAdapter } from '@principal-ai/alexandria-collections';
import { GitHubFileSystemAdapter } from '@your-app/adapters';

const fs = new GitHubFileSystemAdapter({
  owner: 'username',
  repo: 'my-collections',
  token: process.env.GITHUB_TOKEN,
});

const storage = new CollectionStorageAdapter('/', fs);
```

### In-Memory Storage (Testing)

```typescript
import { CollectionStorageAdapter } from '@principal-ai/alexandria-collections';
import { InMemoryFileSystemAdapter } from '@principal-ai/repository-abstraction';

const fs = new InMemoryFileSystemAdapter();
const storage = new CollectionStorageAdapter('/test', fs);

// Perfect for unit tests!
```

## API Reference

### Constructor

```typescript
new CollectionStorageAdapter(
  rootPath: string,
  adapter: FileSystemAdapter,
  options?: CollectionStorageOptions
)
```

**Options:**
- `fileNames`: Custom file names for collections and memberships
  - `collections`: Default `'collections.json'`
  - `memberships`: Default `'collection-memberships.json'`
- `prettyPrint`: Whether to format JSON with indentation (default: `true`)
- `version`: Data format version (default: `'1.0'`)

### Collection Operations

#### `getCollections(): Promise<Collection[]>`
Get all collections.

#### `getCollection(id: string): Promise<Collection | undefined>`
Get a single collection by ID.

#### `createCollection(input): Promise<Collection>`
Create a new collection.

```typescript
const collection = await storage.createCollection({
  name: 'Work Projects',
  description: 'Projects for work',
  icon: 'briefcase',
  theme: 'blue',
  isDefault: false,
  suggestedClonePath: '~/work',
  metadata: { category: 'professional' },
});
```

#### `updateCollection(id: string, updates): Promise<Collection>`
Update an existing collection.

```typescript
const updated = await storage.updateCollection(collection.id, {
  name: 'Work Projects (Updated)',
  description: 'Updated description',
});
```

#### `deleteCollection(id: string): Promise<void>`
Delete a collection and all its memberships (cascade delete).

```typescript
await storage.deleteCollection(collection.id);
```

### Membership Operations

#### `getAllMemberships(): Promise<CollectionMembership[]>`
Get all memberships across all collections.

#### `getCollectionMemberships(collectionId: string): Promise<CollectionMembership[]>`
Get all repositories in a specific collection.

#### `getRepositoryMemberships(repositoryId: string): Promise<CollectionMembership[]>`
Get all collections containing a specific repository.

#### `getMembership(collectionId: string, repositoryId: string): Promise<CollectionMembership | undefined>`
Get a specific membership.

#### `addRepository(collectionId: string, repositoryId: string, metadata?): Promise<CollectionMembership>`
Add a repository to a collection.

```typescript
await storage.addRepository(
  collection.id,
  'owner/repo',
  { source: { owner: 'upstream', name: 'repo' } } // Optional metadata
);
```

#### `removeRepository(collectionId: string, repositoryId: string): Promise<void>`
Remove a repository from a collection.

#### `updateMembershipMetadata(collectionId: string, repositoryId: string, metadata): Promise<CollectionMembership>`
Update metadata for a specific membership.

### Bulk Operations

#### `importData(collections, memberships, strategy?): Promise<void>`
Import collections and memberships with different merge strategies:

- `'replace'` (default): Replace all local data with imported data
- `'merge'`: Add new items, keep existing ones
- `'merge-update'`: Add new items and update existing ones by ID

```typescript
// Replace all data
await storage.importData(
  importedCollections,
  importedMemberships,
  'replace'
);

// Merge with existing data
await storage.importData(
  importedCollections,
  importedMemberships,
  'merge'
);
```

#### `exportData(): Promise<{ collections, memberships }>`
Export all data for backup or sharing.

```typescript
const { collections, memberships } = await storage.exportData();
```

#### `clear(): Promise<void>`
Clear all collections and memberships.

```typescript
await storage.clear();
```

### Utility Methods

#### `exists(): Promise<boolean>`
Check if the collections file exists.

#### `getStats(): Promise<{ collectionsCount, membershipsCount, averageMembershipsPerCollection }>`
Get storage statistics.

```typescript
const stats = await storage.getStats();
console.log(`${stats.collectionsCount} collections with ${stats.membershipsCount} total repositories`);
```

## Migration from CollectionManager

If you're migrating from the old `CollectionManager` class:

```typescript
// Old
const manager = new CollectionManager('/data', adapter);

// New
const storage = new CollectionStorageAdapter('/data', adapter);

// API is mostly the same!
// Main differences:
// - More import strategies (replace/merge/merge-update)
// - Additional utility methods (getRepositoryMemberships, getStats, etc.)
// - Better TypeScript types
```

## Storage Format

Collections are stored in two JSON files:

**collections.json:**
```json
{
  "version": "1.0",
  "collections": [
    {
      "id": "col-1234567890-abc123",
      "name": "My Collection",
      "description": "Description here",
      "createdAt": 1234567890000,
      "updatedAt": 1234567890000
    }
  ]
}
```

**collection-memberships.json:**
```json
{
  "version": "1.0",
  "memberships": [
    {
      "collectionId": "col-1234567890-abc123",
      "repositoryId": "owner/repo",
      "addedAt": 1234567890000,
      "metadata": {}
    }
  ]
}
```

## Advanced: Custom File Names

```typescript
const storage = new CollectionStorageAdapter('/data', adapter, {
  fileNames: {
    collections: 'my-collections.json',
    memberships: 'my-memberships.json',
  },
  prettyPrint: false, // Compact JSON
  version: '2.0', // Custom version
});
```

## Advanced: Private Collections

For private collections, simply use a different storage adapter:

```typescript
// Public collections (GitHub)
const publicStorage = new CollectionStorageAdapter('/', githubAdapter);

// Private collections (local file system)
const privateStorage = new CollectionStorageAdapter('/private', nodeAdapter);

// Or use different file names in the same adapter
const privateStorage = new CollectionStorageAdapter('/', githubAdapter, {
  fileNames: {
    collections: 'private-collections.json',
    memberships: 'private-memberships.json',
  },
});
```

## Error Handling

All methods that can fail will throw errors. Always wrap in try/catch:

```typescript
try {
  await storage.createCollection({ name: 'Test' });
} catch (error) {
  console.error('Failed to create collection:', error);
}
```

Common errors:
- `Collection not found: <id>` - When updating/deleting non-existent collection
- `Membership not found: <repositoryId> in collection <collectionId>` - When updating non-existent membership
- File system errors (from the adapter)

## Best Practices

1. **Use appropriate storage backends**: GitHub for shareable collections, localStorage for browser-only, file system for server-side
2. **Handle errors**: Always wrap storage operations in try/catch
3. **Verify collections exist**: Check `getCollection()` returns a value before operations
4. **Use bulk operations**: Import/export for syncing or backup
5. **Consider merge strategies**: Use `'merge'` when combining data from multiple sources
6. **Test with InMemoryFileSystemAdapter**: Fast and isolated tests

## License

Apache-2.0
