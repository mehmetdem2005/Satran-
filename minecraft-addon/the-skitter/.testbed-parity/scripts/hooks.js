/**
 * Tiny indirection layer so the modules that the Java mod wires together with
 * singletons (AppState <-> GameMaster <-> Hunt) do not need circular ES module
 * imports.
 */
export const hooks = {
  /** () => void - AppState.recreateCreature(); set by state.js */
  recreateCreature: null,
  /** () => Creature|null - AppState.creature; set by state.js */
  currentCreature: null,
  /** (creature, cooldownTicks) => void - GameMaster.despawn(); set by gamemaster.js */
  despawn: null,
  /** () => void - GameMaster.reset(); set by gamemaster.js */
  resetGameMaster: null,
  /** () => boolean - GameMaster.hasPendingRespawn(); set by gamemaster.js */
  hasPendingRespawn: null,
};
