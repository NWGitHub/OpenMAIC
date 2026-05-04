/**
 * S3-backed implementation of the StorageProvider (media dedup) interface.
 *
 * This is separate from the ObjectStore because it uses content-hash keys
 * for deduplication of generated media assets, while the ObjectStore uses
 * semantic path keys for all application data.
 */
import type { StorageProvider, StorageType } from '../types';
import { getObjectStore, S3ObjectStore } from '../object-store';

const TYPE_PREFIX: Record<StorageType, string> = {
  media: 'media-dedup/media',
  poster: 'media-dedup/poster',
  audio: 'media-dedup/audio',
};

export class S3MediaStorageProvider implements StorageProvider {
  private key(hash: string, type: StorageType): string {
    return `${TYPE_PREFIX[type]}/${hash}`;
  }

  async upload(hash: string, blob: Buffer, type: StorageType, mimeType?: string): Promise<string> {
    const store = getObjectStore();
    const key = this.key(hash, type);
    await store.put(key, blob, mimeType);
    return store.mediaUrl(key, '');
  }

  async exists(hash: string, type: StorageType): Promise<boolean> {
    return getObjectStore().exists(this.key(hash, type));
  }

  getUrl(hash: string, type: StorageType): string {
    return getObjectStore().mediaUrl(this.key(hash, type), '');
  }

  async batchExists(hashes: string[], type: StorageType): Promise<Set<string>> {
    const results = await Promise.all(hashes.map((h) => this.exists(h, type)));
    return new Set(hashes.filter((_, i) => results[i]));
  }
}

/**
 * Return true when the object store is S3-backed.
 * Used by callers that need to branch on storage type.
 */
export function isS3Store(): boolean {
  return getObjectStore() instanceof S3ObjectStore;
}
