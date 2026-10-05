import fs from 'node:fs';
import path from 'node:path';

import {
  AVATAR_CLIPS,
  avatarReducer,
  currentClip,
  initialAvatarState,
  type AvatarAction,
  type AvatarEvent,
  type AvatarState,
} from '@/features/avatar/avatarMachine';

const ev = (event: AvatarEvent): AvatarAction => ({ type: 'event', event });
const run = (...actions: AvatarAction[]) => actions.reduce<AvatarState>(avatarReducer, initialAvatarState);
const end = (s: AvatarState) => avatarReducer(s, { type: 'clipEnded', seq: s.seq });

describe('avatarReducer', () => {
  it('aparece con arrive + wave la primera vez y vuelve a idle', () => {
    let s = run(ev({ type: 'appear', firstTime: true }));
    expect(currentClip(s)).toBe('avatar_arrive');
    s = end(s);
    expect(currentClip(s)).toBe('avatar_wave');
    s = end(s);
    expect(currentClip(s)).toBe('avatar_idle');
  });

  it('al entrar en una región salta y corre durante el vuelo, y aterriza con arrive', () => {
    let s = run(ev({ type: 'appear', firstTime: false }), ev({ type: 'travelStart', direction: 'in' }));
    expect(currentClip(s)).toBe('avatar_jump');
    s = end(s);
    expect(currentClip(s)).toBe('avatar_run');
    s = avatarReducer(s, ev({ type: 'travelEnd' }));
    expect(currentClip(s)).toBe('avatar_arrive');
    expect(currentClip(end(s))).toBe('avatar_idle');
  });

  it('al volver camina', () => {
    const s = run(ev({ type: 'travelStart', direction: 'out' }));
    expect(currentClip(s)).toBe('avatar_walk');
  });

  it('gira hacia lo que se pulsa y luego mira el mapa', () => {
    let s = run(ev({ type: 'press', direction: 'left' }));
    expect(currentClip(s)).toBe('avatar_turn_left');
    expect(s.facing).toBe(-1);
    s = end(s);
    expect(currentClip(s)).toBe('avatar_look_map');
    s = end(s);
    expect(s.facing).toBe(0);
  });

  it('ignora eventos de baja prioridad mientras viaja', () => {
    const traveling = run(ev({ type: 'travelStart', direction: 'in' }));
    expect(avatarReducer(traveling, ev({ type: 'press', direction: 'right' }))).toBe(traveling);
    expect(avatarReducer(traveling, ev({ type: 'tap' }))).toBe(traveling);
  });

  it('una nueva transición reemplaza la cola (cancelación)', () => {
    let s = run(ev({ type: 'destinationSelected', direction: 'right' }));
    s = avatarReducer(s, ev({ type: 'travelStart', direction: 'out' }));
    expect(s.queue).toEqual([]);
    expect(currentClip(s)).toBe('avatar_walk');
  });

  it('ignora el fin de un clip interrumpido (seq viejo)', () => {
    const a = run(ev({ type: 'appear', firstTime: true }));
    const b = avatarReducer(a, ev({ type: 'saved' }));
    expect(avatarReducer(b, { type: 'clipEnded', seq: a.seq })).toBe(b);
  });

  it('con reducir movimiento sólo usa idle/arrive', () => {
    let s = run({ type: 'setReduceMotion', value: true }, ev({ type: 'travelStart', direction: 'in' }));
    expect(currentClip(s)).toBe('avatar_idle');
    s = avatarReducer(s, ev({ type: 'press', direction: 'left' }));
    expect(currentClip(s)).toBe('avatar_idle');
    s = avatarReducer(s, ev({ type: 'travelEnd' }));
    expect(currentClip(s)).toBe('avatar_arrive');
  });
});

describe('modelo optimizado', () => {
  const file = path.join(__dirname, '../../assets/models/spoint-explorer.glb');
  const glb = fs.readFileSync(file);
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());

  it('pesa menos de 1,2 MB', () => {
    expect(glb.length).toBeLessThan(1.2 * 1024 * 1024);
  });

  it('conserva las 13 animaciones y un único skin', () => {
    const names = json.animations.map((a: { name: string }) => a.name).sort();
    expect(names).toEqual([...AVATAR_CLIPS].sort());
    expect(json.skins).toHaveLength(1);
  });

  it('no usa compresiones que requieran WebAssembly', () => {
    const used: string[] = json.extensionsUsed ?? [];
    expect(used).not.toContain('KHR_draco_mesh_compression');
    expect(used).not.toContain('EXT_meshopt_compression');
  });
});
