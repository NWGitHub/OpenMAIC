import { NoopStorageProvider } from './providers/noop';
import { S3MediaStorageProvider } from './providers/s3-media';
import type { StorageProvider } from './types';

let _provider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!_provider) {
    if (process.env.STORAGE_BACKEND === 's3') {
      _provider = new S3MediaStorageProvider();
    } else {
      _provider = new NoopStorageProvider();
    }
  }
  return _provider;
}

export type { StorageProvider, StorageType } from './types';
export { getObjectStore, resetObjectStore } from './object-store';
export type { ObjectStore } from './object-store';
