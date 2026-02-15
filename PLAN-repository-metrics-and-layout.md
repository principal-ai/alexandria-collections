# Plan: Repository Traits and Overworld Map Layout Metadata

**Date**: 2026-02-14
**Status**: Planning
**Related Packages**:
- `@principal-ai/alexandria-collections` (this package)
- `@principal-ai/codebase-composition` (peer dependency for package traits)
- `@industry-theme/repository-composition-panels`


## Executive Summary

This plan addresses architectural enhancements to support:
1. **Async repository traits** (file count, line count, etc.) for sprite rendering and visualization
2. **Overworld map layout persistence** (grid positions, region assignments)
3. **Unified handling of remote and local repositories** in collections

### Key Decisions

- ✅ **Traits are separate entities** - cached independently from repository data with their own lifecycle
- ✅ **Volatile GitHub metadata moved to traits** - stars, topics, primaryLanguage, etc. cached with TTL
- ✅ **GithubRepository is stable identity only** - owner, name, fork status (doesn't change)
- ✅ **Layout data belongs in `CollectionMembership.metadata`** - per-collection positioning
- ✅ **Collections can contain both local and remote repos** - decouple from clones

### Why Separate Entities?

**RepositoryTraits** are stored separately from `AlexandriaRepository` because they have fundamentally different lifecycles:

- **Repository data** (name, owner, fork status) is **stable** identity and rarely changes
- **Traits data** (file count, stars, topics, quality scores) is **volatile** and needs frequent updates
- Traits require **TTL-based caching** to avoid expensive filesystem scans and API calls
- Traits can become **stale** independently of repository identity
- Joining at render time allows **flexible caching strategies** without mutating core data

**GitHub metadata split:**
- Previously `GithubRepository` mixed stable identity (owner/name) with volatile data (stars/topics)
- Now volatile GitHub data (stars, topics, primaryLanguage, description, license, lastCommit) lives in `traits.github`
- `GithubRepository` only contains stable identity: owner, name, fork status, visibility
- This prevents invalidating repository identity when stars count changes

**Traits organization:**
- **Top-level** (can come from multiple sources):
  - `fileCount`, `lineCount` - universal metrics
  - `commitHash` - git commit SHA for cache invalidation (local only)
  - Sources: filesystem scan (local) or GitHub API (remote)
- **`git`** (local repos only - from git history):
  - `contributors`, `lastEditedAt`, `createdAt`
- **`github`** (local with GitHub remote, or remote-only - from GitHub API):
  - `stars`, `topics`, `primaryLanguage`, `description`, `license`
  - `lastCommit`, `createdAt`, `contributors`
- **`packages`** (local repos only - from codebase-composition):
  - `data` (PackagesSliceData), `qualityMetrics`

**Benefits:**
- **Top-level for universal metrics** - fileCount/lineCount used by both local and remote
- **Commit hash-based invalidation** - efficient cache invalidation for local repos
  - Single hash represents entire repository state
  - When HEAD changes, invalidate all traits (fileCount, git, packages)
  - Simpler than computing separate hashes for each metric
- **Clear data provenance** - grouped traits show where specialized data comes from
- **Graceful degradation** - remote repos get what GitHub API provides
- **Overlapping field strategy** - some fields available in multiple groups:
  - `contributors`: from `git.contributors` (local) or `github.contributors` (remote)
  - `createdAt`: from `git.createdAt` (local) or `github.createdAt` (remote)
  - Rendering layer implements fallback logic based on available groups
- **Type safety** - consumers know which groups are optional based on repository type

**Storage separation:**
- `project-registry.json` → stable repository identity (no TTL)
- `repository-traits-cache.json` → cached traits with TTL (24 hours)
- `collection-memberships.json` → layout metadata (user-specific positions)

**Using traits for sprite rendering (as of @0.2.64):**
- **Top-level traits**:
  - `fileCount` → Sprite size (discrete tiers 1.0-4.0) ✅ IMPLEMENTED
    - Local: from filesystem scan
    - Remote: from GitHub API stats
  - `lineCount` → Reserved for future use (not currently used)
  - `commitHash` → Internal (cache invalidation only, local repos)
- **Git traits** (`traits.git`):
  - `lastEditedAt` → Age-based region grouping + aging effects ✅ IMPLEMENTED (local only)
  - `contributors` → Reserved for future use (activity indicators)
  - `createdAt` → Reserved for historical timeline view
- **GitHub traits** (`traits.github`):
  - `stars` → Sparkle effects, popularity indicator
  - `primaryLanguage` → Sprite color theme
  - `topics` → Tag badges floating above sprite
  - `description` → Tooltip text
  - `license` → License badge icon
  - `lastCommit` → Alternative to git.lastEditedAt for remote repos
  - `createdAt` → Alternative to git.createdAt for remote repos
  - `contributors` → Alternative to git.contributors for remote repos (activity indicators)
- **Package traits** (`traits.packages`):
  - `qualityMetrics` → Sprite glow/aura color (green = high quality, red = low)
  - `data.summary.isMonorepo` → Compound sprite (cluster of smaller buildings)
  - `data.summary.totalPackages` → Number of sub-buildings in cluster
  - `data.summary.totalDependencies` → Complexity indicator (connection lines)
  - `data.packages[]` → Per-package details:
    - `packageManager` → Icon badge on sprite
    - `configFiles` → Tool badges (ESLint, Prettier, TypeScript icons)
    - `qualityMetrics` → Individual building quality colors
- **Fork status** (from repository.provider.metadata):
  - `isFork` → Fork icon badge, different sprite style
  - `source` → Visual connection line to source repository


## Problem Statement

### Current Architecture Gaps

1. **No standard place for repository traits**
   - `industry-themed-repository-composition-panels` defines local extension `AlexandriaEntryWithMetrics`
   - Traits (file count, line count, etc.) should be standardized for consistency across all consumers
   - Both local (file system) and remote (GitHub API) sources need traits for rendering
   - Traits should be cached separately from repository data due to different lifecycles

2. **No persistence for map layout**
   - Overworld map positions are calculated but not saved
   - User dragging/rearranging repos is lost on refresh
   - Multi-region maps need region assignments stored

3. **Ambiguity: AlexandriaEntry vs AlexandriaRepository**
   - Collections should support uncloned (remote-only) repos
   - Current types conflate "has metadata" with "is cloned locally"
   - Need clear separation: `AlexandriaEntry` = local clone, `AlexandriaRepository` = any repo


## Data Model Relationships

### Current State

```
┌─────────────────┐
│   Collection    │
├─────────────────┤
│ id              │
│ name            │
│ metadata        │
└─────────────────┘
         │
         │ many-to-many via
         ▼
┌──────────────────────┐
│ CollectionMembership │
├──────────────────────┤
│ collectionId         │
│ repositoryId         │──────► Refers to AlexandriaRepository by ID
│ metadata: {          │        (could be local entry or remote repo)
│   pinned?            │
│ }                    │
└──────────────────────┘

┌─────────────────────┐
│ AlexandriaRepository│  ← Defined in alexandria-collections
├─────────────────────┤
│ id                  │
│ name                │
│ provider?           │
│ theme?              │
│ ❌ NO TRAITS        │
└─────────────────────┘
         △
         │
┌────────┴─────────────┐
│  AlexandriaEntry     │  ← Local clone (has path)
├──────────────────────┤
│ + path               │
│ + views, viewCount   │
└──────────────────────┘

(No relationship - traits stored separately)
```

### Proposed State

```
┌─────────────────┐
│   Collection    │
├─────────────────┤
│ id              │
│ name            │
│ metadata: {     │
│   regionLayout? │  ← NEW: Map-level config
│ }               │
└─────────────────┘
         │
         │ many-to-many via
         ▼
┌──────────────────────┐
│ CollectionMembership │
├──────────────────────┤
│ collectionId         │
│ repositoryId         │──────► Refers to AlexandriaRepository by ID
│ metadata: {          │
│   pinned?            │
│   notes?             │
│   layout?: {         │  ← NEW: Per-collection position
│     gridX            │
│     gridY            │
│     regionId?        │
│   }                  │
│ }                    │
└──────────────────────┘

┌─────────────────────┐
│ AlexandriaRepository│  ← Unchanged
├─────────────────────┤
│ id                  │
│ name                │
│ provider?           │
│ theme?              │
└─────────────────────┘
         △
         │
┌────────┴─────────────┐
│  AlexandriaEntry     │  ← Local clone
├──────────────────────┤
│ + path               │
│ + views, viewCount   │
└──────────────────────┘

┌─────────────────────┐
│ RepositoryTraits    │  ← NEW: Separate cached entity
├─────────────────────┤
│ repositoryId        │──────► References AlexandriaRepository.id
│ fileCount?          │  ← Top-level (from filesystem or GitHub API)
│ lineCount?          │  ← Top-level (from filesystem scan)
│ commitHash?         │  ← Git commit hash (for cache invalidation)
│ git?: {             │  ← Git history (local only)
│   contributors?     │
│   lastEditedAt?     │
│   createdAt?        │
│ }                   │
│ github?: {          │  ← GitHub API (local & remote)
│   stars?            │     Moved from GithubRepository
│   primaryLanguage?  │
│   topics?           │
│   description?      │
│   license?          │
│   lastCommit?       │
│   createdAt?        │
│   contributors?     │
│ }                   │
│ packages?: {        │  ← Package analysis (local only)
│   data?             │     from codebase-composition
│   qualityMetrics?   │
│ }                   │
│ lastUpdated         │  ← Cache metadata
│ ttl                 │
│ source              │  ← 'filesystem' | 'github-api' | 'mixed'
└─────────────────────┘
```


## Proposed Type Changes

### 1. GitHub Repository (Package: alexandria-collections)

**BREAKING CHANGE**: Refactor `GithubRepository` to only contain stable identity fields. Move volatile metadata to `RepositoryTraits`.

```typescript
/**
 * Pure GitHub repository identity (stable data only)
 * Volatile metadata (stars, topics, etc.) moved to RepositoryTraits
 */
export interface GithubRepository {
  /** Repository identifier in owner/name format */
  id: string;

  /** Repository owner (username or organization) */
  owner: string;

  /** Repository name */
  name: string;

  /** Default branch name (e.g., "main", "master") - rarely changes */
  defaultBranch?: string;

  /** Whether repository is public - rarely changes */
  isPublic?: boolean;

  /** Whether this repository is a fork - stable */
  isFork?: boolean;

  /** Source repository if this is a fork - stable */
  source?: {
    owner: string;
    name: string;
  };
}

/**
 * Fields REMOVED from GithubRepository (moved to RepositoryTraits):
 * - stars (volatile)
 * - primaryLanguage (volatile)
 * - topics (volatile)
 * - description (volatile)
 * - license (can change but rare)
 * - lastCommit (volatile)
 * - lastUpdated (now in traits cache metadata)
 */
```

### 2. Repository Traits (Package: alexandria-collections)

Repository traits will be defined in `@principal-ai/alexandria-collections` as a separate cached entity with its own lifecycle, independent from `AlexandriaRepository`.

Package-related traits are imported from `@principal-ai/codebase-composition` (peer dependency).

```typescript
import type { PackagesSliceData, QualityMetrics } from '@principal-ai/codebase-composition';

/**
 * Repository traits for sprite rendering and visualization
 * Cached separately from repository data with TTL
 * Populated asynchronously from local filesystem or remote APIs
 */
export interface RepositoryTraits {
  /** Repository identifier (references AlexandriaRepository.id) */
  repositoryId: string;

  // Top-level metrics (can come from multiple sources)
  /** Total number of files in repository - used for sprite size calculation */
  fileCount?: number;

  /** Total lines of code (all files) - reserved for future use */
  lineCount?: number;

  /** Git commit hash for cache invalidation (local repos only) */
  commitHash?: string;

  /** Git traits (local repos only - from git history) */
  git?: {
    /** Number of unique contributors from git log */
    contributors?: number;

    /** ISO timestamp of last edit/commit - CRITICAL for age-based region grouping */
    lastEditedAt?: string;

    /** ISO timestamp of repository creation from git log */
    createdAt?: string;
  };

  /** GitHub volatile metadata (available for both local and remote repos - from GitHub API) */
  github?: {
    /** Number of GitHub stars (changes frequently) */
    stars?: number;

    /** Primary programming language detected by GitHub */
    primaryLanguage?: string;

    /** Repository topics/tags from GitHub */
    topics?: string[];

    /** Repository description from GitHub */
    description?: string;

    /** License identifier (e.g., "MIT", "Apache-2.0") */
    license?: string;

    /** ISO timestamp of last commit from GitHub API */
    lastCommit?: string;

    /** ISO timestamp of repository creation from GitHub API */
    createdAt?: string;

    /** Number of contributors from GitHub API */
    contributors?: number;
  };

  /** Package traits (from codebase-composition, local repos only) */
  packages?: {
    /**
     * Complete package information including:
     * - packages: PackageLayer[] (detailed package data)
     * - summary: PackageSummary (aggregated stats)
     */
    data?: PackagesSliceData;

    /**
     * Repository-level quality metrics hexagon scores
     * Note: Per-package quality metrics are in data.packages[].qualityMetrics
     */
    qualityMetrics?: Partial<QualityMetrics>;
  };

  // Cache metadata
  /** Timestamp when traits were last fetched */
  lastUpdated: number;

  /** Time-to-live in milliseconds */
  ttl: number;

  /** Source of the traits data */
  source: 'filesystem' | 'github-api' | 'mixed';

  /** Extensible for future traits */
  [key: string]: unknown;
}

/**
 * AlexandriaRepository (unchanged - no traits embedded)
 */
export interface AlexandriaRepository {
  id: string;
  name: string;
  purl?: Purl;
  remoteUrl?: string;
  registeredAt: string;
  github?: GithubRepository;
  hasViews: boolean;
  viewCount: number;
  views: CodebaseViewSummary[];
  lastChecked?: string;
  lastOpenedAt?: string;
  bookColor?: string;
  theme?: string;
  // No traits here - they're stored separately
}

/**
 * AlexandriaEntry extends AlexandriaRepository
 */
export interface AlexandriaEntry extends AlexandriaRepository {
  path: ValidatedRepositoryPath;
}

/**
 * Package traits grouped under traits.packages
 * Available for local repositories only (requires codebase analysis)
 */
// Structure:
// packages?: {
//   data?: PackagesSliceData;      // From @principal-ai/codebase-composition
//   qualityMetrics?: QualityMetrics; // Repository-level hexagon scores
// }
//
// PackagesSliceData includes:
//   packages: PackageLayer[];  // Detailed per-package info
//   summary: PackageSummary;   // Aggregate stats
//
// Each PackageLayer includes:
//   - name, version, description, license, author, etc.
//   - packageManager, dependencies, devDependencies, peerDependencies
//   - isMonorepoRoot, isWorkspace, monorepoMetadata
//   - availableCommands, configFiles (eslint, prettier, typescript, etc.)
//   - qualityMetrics (per-package hexagon scores)
//
// PackageSummary aggregates:
//   - isMonorepo, totalPackages, totalDependencies, availableScripts

/**
 * Quality metrics from codebase-composition
 * Hexagon scores (0-100) for quality lenses
 */
// From @principal-ai/codebase-composition:
// interface QualityMetrics {
//   tests: number;
//   deadCode: number;
//   linting: number;
//   formatting: number;
//   types: number;
//   documentation: number;
// }
```

### 2. Layout Metadata (Upstream: alexandria-collections)

```typescript
/**
 * Layout metadata for overworld map positioning
 * Stored per-collection in CollectionMembership.metadata
 *
 * IMPLEMENTATION NOTES (from @industry-theme/repository-composition-panels@0.2.64):
 * - gridX and gridY MUST be whole numbers (rounded to prevent partial tile coverage)
 * - size MUST be one of the discrete tiers: [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]
 * - Boundary = 4 × size tiles, so discrete tiers ensure boundaries cover whole tiles
 * - regionId can be age-based ("Last Month", "Last 3 Months", "Last Year", "Older")
 *   or grid-based ("region-0-0", "region-0-1", etc.)
 */
export interface RepositoryLayoutMetadata {
  /** Grid X coordinate in overworld map (MUST be whole number) */
  gridX?: number;

  /** Grid Y coordinate in overworld map (MUST be whole number) */
  gridY?: number;

  /**
   * Size tier for sprite (MUST be discrete tier: 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, or 4.0)
   * Calculated from fileCount, but can be manually overridden
   */
  size?: number;

  /**
   * Region identifier for multi-region maps
   * Examples: "Last Month", "Last 3 Months", "Last Year", "Older", "region-0-0"
   */
  regionId?: string;

  /** Z-index override for visual layering */
  zIndex?: number;

  /** Whether position was manually set by user (vs auto-layout) */
  isManuallyPositioned?: boolean;

  /** ISO timestamp when position was last updated */
  lastPositionedAt?: string;
}

/**
 * Enhanced CollectionMembership with layout support
 */
export interface CollectionMembership {
  repositoryId: string;
  collectionId: string;
  addedAt: number;
  metadata?: {
    /** Pin to top of collection */
    pinned?: boolean;

    /** Collection-specific notes */
    notes?: string;

    /** Overworld map layout data */
    layout?: RepositoryLayoutMetadata;  // ← NEW

    [key: string]: unknown;
  };
}
```

### 3. Collection Map Configuration (Upstream: alexandria-collections)

```typescript
/**
 * Map-level configuration for overworld visualization
 * Stored in Collection.metadata
 *
 * IMPLEMENTATION NOTES (from @industry-theme/repository-composition-panels@0.2.64):
 * - regionLayout is calculated dynamically based on content (not user-configurable)
 * - Grid size = Math.ceil(sqrt(estimatedRegions)) for square-ish arrangement
 * - Default autoLayout is 'age-based' which groups by last edited time
 */
export interface CollectionMapMetadata {
  /**
   * Auto-layout algorithm preference
   * - 'age-based': Group by recency (Last Month, Last 3 Months, Last Year, Older)
   * - 'none': Manual positioning only
   */
  autoLayout?: 'age-based' | 'none';

  /** Last known viewport position (for camera restoration) */
  viewport?: {
    centerX: number;
    centerY: number;
    zoom: number;
  };

  /** Active region when map has multiple regions */
  activeRegionId?: string;
}

/**
 * Enhanced Collection with map metadata
 */
export interface Collection {
  id: string;
  name: string;
  description?: string;
  theme?: string;
  icon?: string;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
  suggestedClonePath?: string;
  metadata?: {
    /** Overworld map configuration */
    map?: CollectionMapMetadata;  // ← NEW

    [key: string]: unknown;
  };
}
```


## Implementation Plan

### Phase 1: Type Definitions (alexandria-collections)

**Goal**: Refactor `GithubRepository`, add `RepositoryTraits` as separate entity, and layout metadata

**Files to modify**:
- `src/types.ts`
- `package.json` (add peer dependency)

**Changes**:
1. Add `@principal-ai/codebase-composition` as peer dependency
2. Import `PackagesSliceData` and `QualityMetrics` from codebase-composition
3. Refactor `GithubRepository` to remove volatile fields (stars, topics, primaryLanguage, description, license, lastCommit, lastUpdated)
4. Define `RepositoryTraits` interface (separate entity, includes GitHub volatile fields)
5. Add `id` field to `AlexandriaRepository` if not present (needed for traits reference)
6. Define `RepositoryLayoutMetadata` interface
7. Update `CollectionMembership.metadata` type hint
8. Define `CollectionMapMetadata` interface
9. Update `Collection.metadata` type hint
10. Update exports

**Storage Strategy**:
- `project-registry.json` → repositories (stable identity only, no TTL)
- `repository-traits-cache.json` → Map<repositoryId, RepositoryTraits> (cached with TTL)
- `collection-memberships.json` → memberships with layout metadata

**Testing**:
- Verify type compatibility with new schema
- Test JSON serialization/deserialization of traits cache
- Verify traits cache TTL and invalidation logic

### Phase 2: Panel Integration (repository-composition-panels)

**Goal**: Use new types and implement async traits + layout persistence

**Files to modify**:
- `src/panels/CollectionMapPanel.tsx`
- `src/types/composition.ts`

**Changes**:
1. Remove local `AlexandriaEntryWithMetrics` type (use types from alexandria-collections)
2. Import `RepositoryTraits` from alexandria-collections
3. Import `RepositoryLayoutMetadata` from alexandria-collections
4. Update panel to accept both:
   - `repositories: AlexandriaRepository[]`
   - `traits: Map<string, RepositoryTraits>` (or lookup function)
5. Implement `onProjectMoved` callback to save layout
6. Load/apply saved layout from `CollectionMembership.metadata.layout`
7. Handle both `AlexandriaEntry` (has path) and `AlexandriaRepository` (remote only)
8. Join repositories with traits for rendering: `repo + traits.get(repo.id)`

**New functionality**:
- Detect when repo is `AlexandriaEntry` vs plain `AlexandriaRepository`
- Show "not cloned" indicator for remote-only repos
- Persist drag-drop positions to `CollectionMembership.metadata.layout`
- Restore positions on panel mount
- Handle missing traits gracefully (show loading state or default sizing)

### Phase 3: Async Traits Population

**Goal**: Fetch and populate traits from multiple sources

**Where**: Panel framework context providers or dedicated service

**Sources**:
1. **Local repositories** (`AlexandriaEntry` with `path`):
   - **Top-level traits:**
     - `fileCount`: `fs.readdir` recursive count
     - `lineCount`: `cloc` or similar tool
     - `commitHash`: `git rev-parse HEAD` (for cache invalidation)
   - **`git` traits:**
     - `lastEditedAt`: `git log -1 --format=%cI`
     - `contributors`: `git shortlog -s -n --all | wc -l`
     - `createdAt`: `git log --reverse --format=%cI | head -1`
   - **`github` traits** (if GitHub remote exists):
     - Fetch from GitHub API v3/v4
     - `stars`, `topics`, `primaryLanguage`, `description`, `license`, `lastCommit`, `createdAt`, `contributors`
   - **`packages` traits** (via `@principal-ai/codebase-composition`):
     - `data`: Use `PackageLayerModule` to analyze manifest files
       - Returns `PackagesSliceData` with `packages: PackageLayer[]` and `summary: PackageSummary`
     - `qualityMetrics`: Use quality lens system to calculate hexagon scores
     - Requires codebase-composition peer dependency
   - **Source**: `'mixed'` (has both local and potentially GitHub data)

2. **Remote repositories** (GitHub-only, no local clone):
   - **Top-level traits:**
     - `fileCount`: From GitHub repository stats API
     - No commitHash (not a local clone)
   - **`github` traits only:**
     - Fetch from GitHub API v3/v4
     - `stars`, `topics`, `primaryLanguage`, `description`, `license`
     - `lastCommit`, `createdAt` (from repository metadata)
     - `contributors` (from `/repos/{owner}/{repo}/contributors`)
   - **Other trait groups undefined** (`git`, `packages` not available)
   - **Source**: `'github-api'`

**Commit hash-based invalidation:**
- **`commitHash`**: Git commit SHA from `git rev-parse HEAD` (local repos only)
- When cached `commitHash` differs from current HEAD, invalidate all local traits:
  - `fileCount`, `lineCount` (recount files/lines)
  - `git` group (recompute contributors, timestamps)
  - `packages` group (reanalyze packages)
- **Benefits**:
  - Single hash represents entire repository state
  - Simpler than computing separate hashes for different metrics
  - Efficient check: just compare two strings before expensive recalculation
  - TTL-based invalidation for remote repos (no commit hash available)

**Strategy**:
```typescript
interface TraitsService {
  /**
   * Fetch traits for a repository
   * Returns cached data if available and not stale,
   * triggers background refresh if stale or missing
   */
  getTraits(repositoryId: string): RepositoryTraits | undefined;

  /**
   * Fetch traits for a single repository (forces refresh)
   */
  fetchTraits(repo: AlexandriaRepository): Promise<RepositoryTraits>;

  /**
   * Fetch traits for multiple repositories in parallel
   */
  fetchTraitsBatch(repos: AlexandriaRepository[]): Promise<Map<string, RepositoryTraits>>;

  /**
   * Check if cached traits are stale
   */
  isStale(traits: RepositoryTraits): boolean;
}
```

**Caching**:
- Cache traits in memory (per session)
- Persist to `~/.alexandria/repository-traits-cache.json` (with TTL)
- Default TTL: 24 hours
- Invalidate on repo changes (watch git commits for local repos)
- Cache file structure:
  ```typescript
  {
    version: string;
    traits: Record<string, RepositoryTraits>;
  }
  ```


## Data Flow

### 1. Loading a Collection Map

```
User selects Collection
       ↓
CollectionMapPanel mounts
       ↓
Load data from slices:
  - collections: Collection[]
  - memberships: CollectionMembership[]
  - repositories: AlexandriaRepository[]  ← May include remote repos
  - traits: Map<string, RepositoryTraits>  ← Cached separately
       ↓
For each membership:
  - Find matching repository
  - Extract layout from membership.metadata.layout
  - Lookup traits via traits.get(repository.id)
  - Join repo + traits for rendering
  - Convert to GitProject for rendering
       ↓
Render overworld map with:
  - Positions from layout (or auto-layout if none)
  - Sprite sizes from traits.fileCount (universal - from filesystem or GitHub API)
  - Aging effects from traits.git.lastEditedAt OR traits.github.lastCommit (remote)
  - Activity indicators from traits.git.contributors OR traits.github.contributors (remote)
  - Language colors from traits.github.primaryLanguage
  - Quality glow from traits.packages.qualityMetrics
  - Fallback to defaults if traits missing/loading
```

### 2. Dragging a Repository

```
User drags sprite to new position
       ↓
IsometricInteractionManager fires onDragMove
       ↓
Update sprite position in real-time
       ↓
On drag end: onDragEnd(nodeId, gridX, gridY)
       ↓
CollectionMapPanel calls onProjectMoved(projectId, gridX, gridY)
       ↓
Parent context updates CollectionMembership:
  membership.metadata.layout = {
    gridX,
    gridY,
    isManuallyPositioned: true,
    lastPositionedAt: Date.now()
  }
       ↓
Save to disk:
  ~/.alexandria/collection-memberships.json
```

### 3. Fetching Traits (Async)

```
CollectionMapPanel mounts with repositories
       ↓
Load cached traits from ~/.alexandria/repository-traits-cache.json
       ↓
For each repository:
  - Check if traits exist in cache
  - Check if cached traits are stale (TTL expired)
  - If missing or stale, trigger fetch
       ↓
TraitsService.fetchTraitsBatch(repositories)
       ↓
For each repo:
  - If AlexandriaEntry (has path):
      - Spawn background task to scan filesystem
      - Get commitHash: `git rev-parse HEAD`
      - Check if cached commitHash matches current HEAD
      - If hash differs (or no cache), recompute all local traits:
        - Populate top-level: fileCount, lineCount, commitHash
        - Populate git group: lastEditedAt (used for age grouping), contributors, createdAt
        - Populate packages group: via codebase-composition (PackagesSliceData, qualityMetrics)
      - If hash matches, use cached traits (skip expensive recalculation)
      - If has GitHub remote, populate github group: stars, topics, primaryLanguage, etc.
  - If remote (has github metadata):
      - Fetch from GitHub API
      - Populate top-level: fileCount (no commitHash - not a local clone)
      - Populate github group: stars, topics, primaryLanguage, description, license, lastCommit, createdAt, contributors
      - Rate limit: batch requests
       ↓
Create RepositoryTraits objects:
  - repositoryId
  - fileCount, lineCount?, commitHash?  (top-level)
  - git?: { contributors, lastEditedAt, createdAt }  (local only)
  - github?: { stars, topics, primaryLanguage, ... }  (local + remote)
  - packages?: { data, qualityMetrics }  (local only)
  - lastUpdated: Date.now()
  - ttl: 24 * 60 * 60 * 1000
  - source: 'mixed' | 'github-api' | 'filesystem'
       ↓
Update traits cache (in-memory Map)
       ↓
Persist to ~/.alexandria/repository-traits-cache.json
       ↓
React re-renders with updated traits
       ↓
Sprite sizes recalculated via calculateRepositorySize(traits.fileCount)
```


## Backwards Compatibility

### Collections Package

**Type Changes**:
- `GithubRepository` type refactored to remove volatile fields
  - **Removed fields**: `stars`, `primaryLanguage`, `topics`, `description`, `license`, `lastCommit`, `lastUpdated`
  - **Kept fields**: `id`, `owner`, `name`, `defaultBranch`, `isPublic`, `isFork`, `source`
  - Volatile fields now live in `RepositoryTraits` instead
- `RepositoryTraits` is a new separate entity
- `AlexandriaRepository` unchanged (except adding `id` field if missing)
- `layout` is optional in `CollectionMembership.metadata`
- `map` is optional in `Collection.metadata`

**New peer dependency**:
- `@principal-ai/codebase-composition` required for package traits
- Consuming applications must install this peer dependency
- Package traits will be undefined if peer dependency not available

### Panels Package

**Changes**:
- Remove `AlexandriaEntryWithMetrics` (local type)
- Use `AlexandriaRepository` + `RepositoryTraits` (separate entities)
- Update imports and component props to accept traits separately
- Access GitHub metadata from traits instead of repository.provider.metadata


## Questions to Resolve

### 1. What should the default TTL be for traits cache?

**Options**:
- A) 1 hour - Fresh data, more API calls
- B) 24 hours - Balanced (recommended)
- C) 7 days - Less frequent updates
- D) User-configurable per repository

**Recommendation**: B (24 hours) with option for D in future

### 2. Should layout support multiple map types per collection?

**Options**:
- A) One layout per repository per collection (current plan)
- B) Multiple layouts: `metadata.layouts.overworld`, `metadata.layouts.graph`, etc.

**Recommendation**: A for now, extend later if needed

### 3. Auto-layout algorithm for new repos?

When a repository is added to a collection without `layout` metadata:
- A) Random placement within region bounds
- B) Force-directed layout algorithm
- C) Grid-based auto-placement (next available slot)
- D) Age-based grouping (group by last edited time into regions)

**Recommendation**: ✅ **IMPLEMENTED: D** - Age-based grouping in @industry-theme/repository-composition-panels@0.2.64
- Groups repos by recency: Last Month → Last 3 Months → Last Year → Older
- Each age group gets its own region(s)
- Uses circle packing within each region to prevent overlaps
- Most recent projects appear in first regions


## Success Criteria

### Traits

- ✅ `RepositoryTraits` type exists as separate entity with grouped structure
- ✅ Top-level universal traits: `fileCount`, `lineCount`, `commitHash`
- ✅ Traits grouped by provider: `git`, `github`, `packages`
- ✅ `commitHash` field for cache invalidation (git commit SHA)
- ✅ `GithubRepository` refactored to stable identity only
- ✅ GitHub volatile metadata (stars, topics, primaryLanguage, etc.) moved to `traits.github`
- ✅ `@principal-ai/codebase-composition` added as peer dependency
- ✅ Local repos populate top-level `fileCount`, `lineCount`, `commitHash` from filesystem/git
- ✅ Local repos check `commitHash` before recomputing expensive traits
- ✅ Local repos can fetch `git` traits (contributors, lastEditedAt, createdAt)
- ✅ Local repos can fetch `packages` traits (PackagesSliceData with detailed package info)
- ✅ Local repos with GitHub remote can fetch `github` traits (stars, topics, etc.)
- ✅ Remote GitHub repos fetch top-level `fileCount` from GitHub API
- ✅ Remote GitHub repos fetch `github` traits including contributors, createdAt
- ✅ Traits cache to disk with TTL to avoid redundant scans/API calls
- ✅ Commit hash-based invalidation for local repos (check HEAD before recomputing)
- ✅ TTL-based invalidation for remote repos (no commit hash available)
- ✅ Source field indicates data origin: 'filesystem', 'github-api', or 'mixed'
- ✅ Sprite sizes scale based on `traits.fileCount` (universal)
- ✅ Aging effects based on `traits.git.lastEditedAt` or `traits.github.lastCommit`
- ✅ Quality colors/glow based on `traits.packages.qualityMetrics`
- ✅ Language-based coloring via `traits.github.primaryLanguage`
- ✅ Popularity indicators via `traits.github.stars`
- ✅ Topic badges via `traits.github.topics`
- ✅ Monorepo detection via `traits.packages.data.summary.isMonorepo`
- ✅ Per-package details accessible via `traits.packages.data.packages[]`
- ✅ Missing/loading trait groups handled gracefully with defaults

### Layout

- ✅ User can drag repositories on overworld map
- ✅ Positions persist across page refreshes
- ✅ Each collection has independent layout
- ✅ Multi-region maps track region assignments
- ✅ Manual positions marked with `isManuallyPositioned`
- ✅ Auto-layout fills empty regions

### Remote Repositories

- ✅ Collections can include uncloned (remote-only) repos
- ✅ Map renders remote repos with GitHub metadata
- ✅ Visual indicator shows "not cloned" state
- ✅ Clicking remote repo offers to clone


## Next Steps

1. **Review and approve** this plan
2. **Implement Phase 1**:
   - Refactor `GithubRepository` to remove volatile fields
   - Add `RepositoryTraits` and layout types to alexandria-collections
3. **Implement Phase 2**:
   - Update repository-composition-panels to use separate traits
   - Update panels to read GitHub metadata from traits instead of repository
4. **Implement Phase 3**:
   - Build traits service with caching
   - Integrate codebase-composition for package traits
5. **Test end-to-end**:
   - Drag, persist, reload
   - Traits population and cache invalidation
   - GitHub metadata rendering from traits


## Related Issues / PRs

- [ ] alexandria-collections: Refactor `GithubRepository` to remove volatile fields
- [ ] alexandria-collections: Add `@principal-ai/codebase-composition` as peer dependency
- [ ] alexandria-collections: Add `RepositoryTraits` type and layout metadata types (includes GitHub volatile fields)
- [ ] alexandria-collections: Implement traits cache service
- [ ] repository-composition-panels: Update to use separate traits entity
- [ ] repository-composition-panels: Access GitHub metadata from traits instead of repository.provider
- [ ] repository-composition-panels: Implement layout persistence
- [ ] repository-composition-panels: Use GitHub traits for sprite rendering (stars, language colors, topics badges)
- [ ] repository-composition-panels: Use package traits for sprite rendering (quality colors, monorepo indicators)
- [ ] web-ade: Wire up traits fetching in context providers


## Implementation Status

### ✅ Completed in @industry-theme/repository-composition-panels@0.2.64 (2026-02-15)

**Discrete Size Tiers**:
- Implemented size tiers: `[1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]`
- Size calculation uses only `fileCount` (simplified from composite metrics)
- Logarithmic scaling: log10(fileCount) mapped to tiers
- Examples:
  - ≤100 files → 1.0x
  - 316 files → 1.5x
  - 1000 files → 2.0x
  - 2000 files → 2.5x
  - 10000 files → 3.0x
- Ensures boundaries (4 × size) always cover whole tiles

**Whole-Tile Position Snapping**:
- All sprite positions rounded to whole numbers
- Layout engine uses 0.5 tile search step but rounds final positions
- Prevents partial grid square coverage by boundaries
- Drag-and-drop also snaps to whole tiles

**Age-Based Region Grouping**:
- Implemented automatic grouping by `lastEditedAt`:
  - Last Month: 0-30 days
  - Last 3 Months: 31-90 days
  - Last Year: 91-365 days
  - Older: 365+ days
- Each age group gets separate region(s)
- Uses circle packing within regions to prevent overlaps
- Region names: "Last Month", "Last 3 Months", "Last Year", "Older"

**Collision Detection**:
- Proper boundary-based collision detection (radius = 2 × size)
- 0.5 tile spacing between boundaries
- 0.3 tile grid quantization buffer
- All sprites positioned collision-free

**Visual Enhancements**:
- Nearby sprite highlights during drag (within 1 tile of boundary)
- Resize flashing fixed with preserveDrawingBuffer and opacity transitions
- Empty state shows map with overlay message
- Initial highlight boundaries hidden (shown on hover only)

**Test Coverage**:
- 30 new tests added
- 540 assertions across layout engine, generic mapper, and repository scaling
- Tests verify: discrete tiers, whole-tile positions, collision-free layout, age grouping

### 🔄 Remaining Work (This Package)

**Type Definitions** (alexandria-collections):
- [ ] Add `RepositoryLayoutMetadata` interface to `src/types.ts`
- [ ] Add `CollectionMapMetadata` interface to `src/types.ts`
- [ ] Update `RepositoryTraits` to include `lastEditedAt` (critical for age grouping)
- [ ] Update `CollectionMembership.metadata` to include `layout?: RepositoryLayoutMetadata`
- [ ] Update `Collection.metadata` to include `map?: CollectionMapMetadata`
- [ ] Remove unused fields: `commitCount` (not used in current implementation)
- [ ] Document discrete size tier requirement
- [ ] Document whole-tile position requirement

**Storage & Caching**:
- [ ] Implement traits cache service with TTL
- [ ] Implement layout persistence (save/load from CollectionMembership.metadata)

**Panel Integration** (repository-composition-panels):
- [ ] Implement `onProjectMoved` callback to persist layout changes
- [ ] Load saved layout from `CollectionMembership.metadata.layout` on mount
- [ ] Restore viewport position from `Collection.metadata.map.viewport`
- [ ] Handle both AlexandriaEntry (local) and AlexandriaRepository (remote)

**Traits Service** (web-ade or similar):
- [ ] Implement async traits fetching for local repos:
  - [ ] Get commitHash via `git rev-parse HEAD`
  - [ ] Check if cached commitHash matches current HEAD
  - [ ] If hash differs, recompute all local traits:
    - [ ] Top-level: fileCount, lineCount, commitHash
    - [ ] `git` group (lastEditedAt, contributors, createdAt)
    - [ ] `packages` group (via codebase-composition)
  - [ ] If hash matches, use cached traits (skip expensive recalculation)
- [ ] Implement GitHub API traits fetching:
  - [ ] Top-level: fileCount (no commitHash for remote)
  - [ ] `github` group for remote repos
  - [ ] `github` group for local repos with GitHub remote
- [ ] Implement commit hash-based cache invalidation for local repos
- [ ] Implement TTL-based caching for remote repos (24 hours default)
- [ ] Wire up traits service to panel context

## Notes

- `Collection` is a concept specific to `alexandria-collections` and is distinct from workspace concepts in other packages
- Collections provide a way to organize and group repositories with custom metadata and layouts
- The overworld map is currently read-only for remote repos; future enhancement could allow metadata editing
- **Architectural decision**: GitHub metadata split into stable identity (in `GithubRepository`) vs volatile data (in `RepositoryTraits`) follows the same pattern as separating repository identity from computed traits
- This prevents repository identity invalidation when volatile data like star counts change
- Fork status (`isFork`, `source`) stays in `GithubRepository` because it's stable identity, not volatile metadata
- **Size calculation simplified**: Current implementation uses only `fileCount` for sizing, not composite metrics (lineCount, contributors reserved for future use)
- **Top-level universal metrics**: `fileCount` and `lineCount` are top-level (not grouped) because:
  - Used by both local (filesystem scan) and remote (GitHub API) repositories
  - Core metrics for sprite rendering (size calculation)
  - Having them at top level simplifies rendering code (no conditional access)
- **Commit hash-based invalidation for local repos**:
  - `commitHash`: Git commit SHA from `git rev-parse HEAD`
  - Single hash represents entire repository state
  - When cached `commitHash` differs from current HEAD, recompute all local traits
  - Simpler than computing separate hashes for each metric (fileCount, lineCount, etc.)
  - More precise than TTL: only recompute when actual changes committed
  - Remote repos use TTL-based invalidation (no git clone available)
- **Overlapping fields strategy**: Some fields (contributors, createdAt) can come from multiple sources:
  - Local repos: prefer `git` values (more accurate from direct git log analysis)
  - Remote repos: use `github` values (only source available)
  - Both stored in their respective groups for clear data provenance
  - Rendering layer implements fallback logic based on available groups
