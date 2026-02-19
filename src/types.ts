/**
 * Collection types
 *
 * Collections organize repositories without requiring local clones.
 * This enables tracking remote repositories you're interested in
 * alongside locally cloned ones.
 */

import type { PackagesSliceData, QualityMetrics } from '@principal-ai/codebase-composition';

// ============================================================================
// GitHub Repository Types
// ============================================================================

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

// ============================================================================
// Repository Provider Types
// ============================================================================

/**
 * Discriminated union for repository providers
 * Each provider type carries its own metadata structure
 */
export type RepositoryProvider =
  | { type: 'github'; metadata: GithubRepository }
  | { type: 'gitlab'; url: string }
  | { type: 'bitbucket'; url: string }
  | { type: 'generic'; url: string };

// ============================================================================
// Alexandria Repository Types
// ============================================================================

/**
 * Alexandria repository with optional provider information
 * Base type for repositories in the Alexandria ecosystem
 */
export interface AlexandriaRepository {
  /** Project/repository name */
  name: string;

  /** ISO timestamp when repository was registered */
  registeredAt: string;

  /** Provider-specific information */
  provider?: RepositoryProvider;

  /** ISO timestamp when metadata was last verified/refreshed */
  lastChecked?: string;

  /** Optional theme identifier */
  theme?: string;
}

// ============================================================================
// Collection Types
// ============================================================================

/**
 * A collection for organizing repositories
 * Does not require local clones - can reference remote repositories
 */
export interface Collection {
  /** Unique identifier (UUID) */
  id: string;
  /** Display name (e.g., "Active Projects", "Reading List") */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional theme identifier */
  theme?: string;
  /** Optional icon identifier */
  icon?: string;
  /** Default collection for new clones */
  isDefault?: boolean;
  /** Unix timestamp */
  createdAt: number;
  /** Unix timestamp */
  updatedAt: number;
  /** Optional path hint for clone suggestions */
  suggestedClonePath?: string;
  /** Collection metadata with region and map configuration */
  metadata?: CollectionMetadata;
  /** Repository memberships in this collection */
  members: CollectionMembership[];
}

/**
 * Maps repositories to collections (many-to-many)
 *
 * Uses repository identity so all local clones of a repository
 * share the same collection memberships
 */
export interface CollectionMembership {
  /** Repository identity (e.g., "owner/name" for GitHub repos) */
  repositoryId: string;
  /** Collection identifier */
  collectionId: string;
  /** Unix timestamp when added */
  addedAt: number;
  /** Collection-specific metadata with region and layout info */
  metadata?: CollectionMembershipMetadata;
}

/**
 * Storage structure for individual collection files
 * Each collection is stored in collections/{id}.json
 */
export interface CollectionFile {
  version: string;
  collection: Collection;
}

// ============================================================================
// Repository Traits Types
// ============================================================================

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
 * Layout metadata for overworld map positioning
 * Stored per-collection in CollectionMembership.metadata
 */
export interface RepositoryLayoutMetadata {
  /** Grid X coordinate in overworld map */
  gridX?: number;

  /** Grid Y coordinate in overworld map */
  gridY?: number;

  /** Region identifier for multi-region maps */
  regionId?: string;

  /** Z-index override for visual layering */
  zIndex?: number;

  /** Whether position was manually set by user (vs auto-layout) */
  isManuallyPositioned?: boolean;

  /** Timestamp when position was last updated */
  lastPositionedAt?: number;
}

/**
 * Map-level configuration for overworld visualization
 * Stored in Collection.metadata
 */
export interface CollectionMapMetadata {
  /** Region layout configuration */
  regionLayout?: {
    columns?: number;
    rows?: number;
    fillDirection?: 'horizontal' | 'vertical';
  };

  /** Auto-layout algorithm preference */
  autoLayout?: 'force-directed' | 'grid' | 'radial' | 'none';

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
 * Custom region definition for manual layout
 * Regions allow organizing repositories into visual groups on the overworld map
 */
export interface CustomRegion {
  /** Unique region identifier */
  id: string;
  /** Display name for the region */
  name: string;
  /** Optional description */
  description?: string;
  /** Optional theme color (hex) */
  color?: string;
  /** Display order (0-based) */
  order: number;
  /** Unix timestamp when region was created */
  createdAt: number;
}

/**
 * Collection metadata with region support
 * Extends the basic Collection.metadata with typed region fields
 */
export interface CollectionMetadata {
  /** Custom regions defined by the user */
  customRegions?: CustomRegion[];

  /** Map visualization configuration */
  map?: CollectionMapMetadata;

  /** Allow additional metadata */
  [key: string]: unknown;
}

/**
 * Layout position data for repositories
 * Stored in CollectionMembership.metadata.layout
 * Once set, positions are persisted to prevent drift
 */
export interface RepositoryLayoutData {
  /** Grid X coordinate */
  gridX: number;
  /** Grid Y coordinate */
  gridY: number;
}

/**
 * Collection membership metadata with region and layout support
 * Extends the basic CollectionMembership.metadata with typed fields
 */
export interface CollectionMembershipMetadata {
  /** Which custom region this repository belongs to */
  regionId?: string;

  /** Manual position override (for manual layout mode) */
  layout?: RepositoryLayoutData;

  /** Whether this repository is pinned */
  pinned?: boolean;

  /** User notes about this repository */
  notes?: string;

  /** Allow additional metadata */
  [key: string]: unknown;
}
