import { LruCache } from '@/lib/cache';

describe('LruCache', () => {
  it('descarta la entrada menos usada recientemente', () => {
    const c = new LruCache<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.has('a')).toBe(true);
    expect(c.has('b')).toBe(false);
    expect(c.size).toBe(2);
  });
});
