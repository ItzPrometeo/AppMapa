/**
 * TransitionTimeline — la ÚNICA fuente de pasos temporizados del avatar.
 *
 * En lugar de setTimeout repartidos por componentes, cada transición programa
 * sus pasos aquí (en ms relativos a su inicio) y `cancel()` los anula todos de
 * golpe: si el usuario elige otra región a mitad de animación no se acumulan
 * walk → jump → arrive → walk → jump…
 *
 * Los efectos ligados al zoom (fundido, recolocación) NO usan esta timeline:
 * se derivan del progreso real de la cámara en el hilo de UI.
 */
export class TransitionTimeline {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private generation = 0;

  /** Programa `fn` a `atMs` del inicio de la transición actual. */
  at(atMs: number, fn: () => void) {
    const gen = this.generation;
    this.timers.push(
      setTimeout(
        () => {
          if (gen === this.generation) fn();
        },
        Math.max(0, atMs),
      ),
    );
  }

  /** Anula todo lo pendiente y abre una nueva "generación". */
  cancel() {
    this.generation++;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  get pending() {
    return this.timers.length;
  }
}
