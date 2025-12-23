/**
 * Collection types
 *
 * Collections organize repositories without requiring local clones.
 * This enables tracking remote repositories you're interested in
 * alongside locally cloned ones.
 */

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
