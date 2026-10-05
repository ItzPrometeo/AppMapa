/**
 * Caché de dos niveles:
 *   1. Memoria (LRU) — acceso síncrono, se pierde al cerrar la app.
 *   2. Disco (AsyncStorage) — sobrevive reinicios; con versión y TTL.
 *
 * `getOrLoad` implementa stale-while-revalidate: si hay un valor en disco se
 * devuelve inmediatamente (aunque haya caducado) y se refresca en segundo
 * plano; si la red falla se sigue usando el valor guardado (modo offline).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

type Entry<T> = { v: number; t: number; data: T };

export class LruCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly max: number) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Re-inserción = marcar como usado recientemente.
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
  }

  has(key: K) {
    return this.map.has(key);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

export type PersistentCacheOptions = {
  namespace: string;
  /** Cambiar la versión invalida todo lo guardado (p. ej. al cambiar el esquema). */
  version: number;
  /** Tiempo tras el cual un valor se considera "stale" (ms). */
  ttl: number;
  memoryEntries?: number;
};

export class PersistentCache<T> {
  private memory: LruCache<string, Entry<T>>;
  private inflight = new Map<string, Promise<T>>();

  constructor(private readonly options: PersistentCacheOptions) {
    this.memory = new LruCache(options.memoryEntries ?? 32);
  }

  private storageKey(key: string) {
    return `spoint:${this.options.namespace}:${key}`;
  }

  private isFresh(entry: Entry<T>) {
    return Date.now() - entry.t < this.options.ttl;
  }

  peek(key: string): T | undefined {
    return this.memory.get(key)?.data;
  }

  async read(key: string): Promise<Entry<T> | null> {
    const mem = this.memory.get(key);
    if (mem) return mem;
    try {
      const raw = await AsyncStorage.getItem(this.storageKey(key));
      if (!raw) return null;
      const entry = JSON.parse(raw) as Entry<T>;
      if (entry.v !== this.options.version) return null;
      this.memory.set(key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  async write(key: string, data: T): Promise<void> {
    const entry: Entry<T> = { v: this.options.version, t: Date.now(), data };
    this.memory.set(key, entry);
    try {
      await AsyncStorage.setItem(this.storageKey(key), JSON.stringify(entry));
    } catch {
      // Disco lleno o no disponible: la caché en memoria sigue funcionando.
    }
  }

  /**
   * Devuelve el valor cacheado o lo carga. `onRefresh` recibe el valor nuevo
   * cuando una revalidación en segundo plano trae datos distintos.
   */
  async getOrLoad(key: string, loader: () => Promise<T>, onRefresh?: (fresh: T) => void): Promise<T> {
    const cached = await this.read(key);
    if (cached) {
      if (!this.isFresh(cached)) {
        this.dedupe(key, loader)
          .then((fresh) => {
            if (JSON.stringify(fresh) !== JSON.stringify(cached.data)) onRefresh?.(fresh);
          })
          .catch(() => undefined);
      }
      return cached.data;
    }
    return this.dedupe(key, loader);
  }

  private dedupe(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const promise = loader()
      .then(async (data) => {
        await this.write(key, data);
        return data;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}
