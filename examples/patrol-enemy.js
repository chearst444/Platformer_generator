// ===========================================================
// Example plugin: a patrolling enemy actor.
//
// Drag this file onto the Universal Drop Zone, then find
// "Patrol Enemy" in the Asset Palette's Actors tray — drag/click
// it onto the level like any other tile. It walks back and forth
// around its spawn point and damages the player on contact.
// ===========================================================

(function () {
  const RANGE = 80;  // how far from its spawn point it patrols, in pixels
  const SPEED = 1.5; // pixels per physics tick (already framerate-normalized)

  window.PlatformSandbox.registerBehavior('patrol', {
    label: 'Patrol Enemy',
    color: '#e91e63',
    icon: '\u{1F47E}', // 👾

    onSpawn(entity) {
      entity.meta.originX = entity.x;
      entity.meta.dir = 1;
    },

    onUpdate(entity, dtFactor) {
      if (entity.meta.originX === undefined) { entity.meta.originX = entity.x; entity.meta.dir = 1; }
      entity.x += entity.meta.dir * SPEED * dtFactor;
      if (entity.x > entity.meta.originX + RANGE) entity.meta.dir = -1;
      if (entity.x < entity.meta.originX - RANGE) entity.meta.dir = 1;
    },

    onPlayerCollide(entity, ctx) {
      ctx.state.damagePlayer(10);
    },
  });

  window.PlatformSandbox.log('Patrol Enemy actor registered — find it in the Actors palette tray.');
})();
