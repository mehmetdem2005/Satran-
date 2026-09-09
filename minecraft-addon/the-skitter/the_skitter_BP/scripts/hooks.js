/**
 * Tiny indirection layer so the modules that the Java mod wires together with
 * singletons (AppState <-> GameMaster <-> Hunt <-> brains) do not need circular
 * ES module imports.
 */
export const hooks = {
  /** () => void - AppState.recreateCreature() */
  recreateCreature: null,
  /** (creature, cooldownTicks) => void - GameMaster.despawn() */
  despawn: null,
  /** () => void - GameMaster.reset() */
  resetGameMaster: null,
  /** (creature) => Brain - new HunterBrain(creature) */
  hunterBrain: null,
  /** (creature) => Brain - new MiniHunterBrain(creature) */
  miniHunterBrain: null,
  /** (creature) => void - HuntingKt.die() path used when health hits zero */
  killCreature: null,
};
