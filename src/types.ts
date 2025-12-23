/**
 * Collection types
 *
 * Collections organize repositories without requiring local clones.
 * This enables tracking remote repositories you're interested in
 * alongside locally cloned ones.
 */

// ============================================================================
// GitHub Repository Types
// ============================================================================

/**
 * Pure GitHub repository metadata
 * Standard fields from GitHub API
 */
export interface GithubRepository {
  /** Repository identifier in owner/name format */
  id: string;

  /** Repository owner (username or organization) */
  owner: string;

  /** Repository name */
  name: string;

  /** Repository description */
  description?: string;

  /** Number of GitHub stars */
  stars: number;

  /** Primary programming language */
  primaryLanguage?: string;

  /** Repository topics from GitHub */
  topics?: string[];

  /** License identifier (e.g., "MIT", "Apache-2.0") */
  license?: string;

  /** ISO timestamp of last commit */
  lastCommit?: string;

  /** Default branch name (e.g., "main", "master") */
  defaultBranch?: string;

  /** Whether repository is public */
  isPublic?: boolean;

  /** ISO timestamp when GitHub metadata was last updated */
  lastUpdated: string;
}

// ============================================================================
// Alexandria Repository Types
// ============================================================================

/**
 * Alexandria repository with optional GitHub remote information
 * Base type for repositories in the Alexandria ecosystem
 */
export interface AlexandriaRepository {
  /** Project/repository name */
  name: string;

  /** Git remote URL */
  remoteUrl?: string;

  /** ISO timestamp when repository was registered */
  registeredAt: string;

  /** GitHub metadata when available */
  github?: GithubRepository;

  /** ISO timestamp when metadata was last verified/refreshed */
  lastChecked?: string;

  /** Optional color for visual representation (e.g., "#FF5733", "blue", "rgb(255,87,51)") */
  bookColor?: string;

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
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
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
  /** Collection-specific metadata for this repository */
  metadata?: {
    /** Pin to top of collection */
    pinned?: boolean;
    /** Collection-specific notes */
    notes?: string;
    [key: string]: unknown;
  };
}

/**
 * Storage structure for collections.json
 */
export interface CollectionsData {
  version: string;
  collections: Collection[];
}

/**
 * Storage structure for collection-memberships.json
 */
export interface CollectionMembershipsData {
  version: string;
  memberships: CollectionMembership[];
}
