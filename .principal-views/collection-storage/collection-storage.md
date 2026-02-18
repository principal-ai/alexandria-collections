# Collection Storage

## Overview

The Collection Storage system provides a unified, storage-agnostic way to manage collections and their repository memberships. It enables applications to persist collection data across different backends (GitHub, localStorage, file system, in-memory) through a single, consistent API.

## Problem Statement

Before this system, collection management logic was duplicated across multiple locations:
- **web-ade** had its own `UserCollectionsContext` that directly called GitHub APIs
- **alexandria-collections** had a `CollectionManager` that wasn't actively used
- ID generation, import/merge logic, and CRUD operations were repeated in both places
- No easy way to switch between storage backends (public GitHub, private local storage, etc.)
- Testing required complex mocking of storage layers

## Solution

The `CollectionStorageAdapter` provides:

1. **Single Source of Truth**: All collection CRUD operations go through one adapter
2. **Storage Backend Abstraction**: Works with any `FileSystemAdapter` implementation
3. **Consistent Operations**: Same API whether you're using GitHub, localStorage, or in-memory storage
4. **Flexible Import/Export**: Three merge strategies (replace, merge, merge-update) for data synchronization
5. **Telemetry-Ready**: Designed to emit OpenTelemetry events for all operations

## Core Operations

### Collection CRUD
- **Create**: Generate unique collection ID, validate input, write to storage
- **Read**: Load collections from storage backend
- **Update**: Modify existing collection metadata
- **Delete**: Remove collection and cascade delete all memberships

### Repository Membership Management
- **Add Repository**: Add a repository to a collection with optional metadata
- **Remove Repository**: Remove repository from collection
- **Get Memberships**: Query which repositories belong to which collections
- **Update Metadata**: Modify membership-specific metadata (e.g., fork source info, layout positions)

### Bulk Operations
- **Import**: Bring in collections from external sources
  - **Replace**: Completely replace local data (GitHub as source of truth)
  - **Merge**: Add new items, keep existing ones
  - **Merge-Update**: Add new items and update existing ones by ID
- **Export**: Extract all collections and memberships for backup or sharing
- **Clear**: Remove all data (useful for testing)

## Design Choices

### Why FileSystemAdapter?

The `FileSystemAdapter` interface from `@principal-ai/repository-abstraction` provides:
- Proven abstraction that works across Node.js, Bun, browsers, and tests
- Async-first API with optional sync methods
- Path manipulation utilities built-in
- Already implemented for common environments

### Why Two Files (collections.json + collection-memberships.json)?

**Separation of Concerns:**
- Collections change infrequently (name, description, theme)
- Memberships change frequently (adding/removing repos)
- Separate files allow partial updates without rewriting everything
- Easier to query "all repos in collection" vs "all collections containing repo"

**Data Integrity:**
- Can validate collections exist before adding memberships
- Cascade deletes are explicit and traceable
- Membership metadata doesn't bloat collection objects

### Why Three Import Strategies?

Different use cases require different merge behaviors:

1. **Replace** (GitHub sync): "GitHub is the source of truth, local changes don't matter"
   - User logs in → load their collections from GitHub
   - Sharing collections → adopt shared collection completely

2. **Merge** (Combining sources): "Keep my local stuff, add new items from import"
   - Importing curated collections while keeping personal ones
   - Offline-first apps syncing with server

3. **Merge-Update** (Bidirectional sync): "Update existing, add new"
   - Collaborative editing scenarios
   - Syncing changes between devices

## Common Workflows

### Initial Setup (New User)
1. User authenticates with GitHub
2. App creates `CollectionStorageAdapter` with `GitHubFileSystemAdapter`
3. Check if collections repo exists (`exists()`)
4. If not, initialize empty collections
5. User creates first collection (`createCollection()`)
6. Collections saved to user's GitHub repo

### Adding Repository to Collection
1. User selects collection and enters repository ID
2. App calls `addRepository(collectionId, repositoryId, metadata)`
3. Adapter validates collection exists
4. Creates membership entry with current timestamp
5. Writes to `collection-memberships.json`
6. Returns membership object (handles idempotency if already exists)

### Importing Shared Collections
1. User finds interesting collection on someone else's GitHub
2. App fetches their `collections.json` and `collection-memberships.json`
3. User chooses import strategy (typically "merge")
4. App calls `importData(collections, memberships, 'merge')`
5. Adapter merges with existing data (avoids duplicates by ID)
6. New collections appear alongside user's personal collections

### Testing with In-Memory Storage
1. Test creates `InMemoryFileSystemAdapter`
2. Creates `CollectionStorageAdapter` with in-memory adapter
3. Runs full CRUD cycle (create, add repos, export, clear)
4. No disk I/O, fast and isolated
5. Test cleans up automatically (in-memory data disappears)

## Error Scenarios and Recovery

### Collection Not Found
**Scenario**: Try to add repository to non-existent collection
**Behavior**: Throws error immediately before attempting write
**Recovery**: Create collection first, or handle gracefully in UI

### Storage Write Failure
**Scenario**: GitHub API rate limit, disk full, network error
**Behavior**: Exception thrown from `FileSystemAdapter`
**Recovery**: Retry with exponential backoff, fall back to localStorage, queue for later

### Duplicate Repository Addition
**Scenario**: Add repository that's already in collection
**Behavior**: Returns existing membership (idempotent)
**Recovery**: None needed, operation succeeds

### Import Conflict (Merge-Update)
**Scenario**: Imported collection has same ID but different name
**Behavior**: Imported version wins (replaces local)
**Recovery**: User can manually fix or re-export their version

## Multi-Backend Usage (Private + Public Collections)

Applications can use multiple storage adapters simultaneously:

```typescript
// Public collections (GitHub)
const publicStorage = new CollectionStorageAdapter(
  '/',
  new GitHubFileSystemAdapter({ repo: 'user/collections' })
);

// Private collections (local file system)
const privateStorage = new CollectionStorageAdapter(
  '/private',
  new NodeFileSystemAdapter()
);

// Separate management
const publicCollections = await publicStorage.getCollections();
const privateCollections = await privateStorage.getCollections();
```

This enables:
- Shareable curated collections (public GitHub)
- Personal work collections (private local storage)
- Team collections (private GitHub repo)
- Offline-first collections (localStorage with sync)

## Future Enhancements

1. **Conflict Resolution**: More sophisticated merge strategies with conflict detection
2. **Version Migration**: Automated migration when data format changes
3. **Compression**: Gzip large membership lists
4. **Encryption**: Support for encrypted private collections
5. **Partial Exports**: Export specific collections instead of all
6. **Collection Sharing URLs**: Generate shareable links to collections
7. **Collaboration**: Multiple users editing same collection with CRDTs

## Telemetry Events

All operations emit OpenTelemetry events for observability:
- `collection.create.started/complete/error`
- `repository.add.started/complete/error`
- `import.started/complete/error`
- `export.started/complete/error`

Events include:
- Input parameters (collection name, repository ID, strategy)
- Output results (collection ID, counts, success/failure)
- Performance metrics (duration)
- Error details (type, message, stage)

This enables:
- Monitoring collection usage patterns
- Debugging import/export issues
- Performance optimization
- Usage analytics
