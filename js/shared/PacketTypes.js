/**
 * Astropia – PacketTypes
 * https://github.com/Zecay/Astropia
 *
 * Shared enum for all action packet types exchanged between
 * the client and the (mock) server. Using a flat object so
 * it works without module bundlers.
 */

const PacketType = Object.freeze({
  /* ─── Connection ─── */
  CONNECT:         'connect',
  DISCONNECT:      'disconnect',
  PING:            'ping',
  PONG:            'pong',

  /* ─── World Actions ─── */
  PLAYER_MOVE:     'player_move',
  PLAYER_JUMP:     'player_jump',
  PLAYER_PUNCH:    'player_punch',     // punch/destroy a tile
  PLAYER_BUILD:    'player_build',     // place a block
  PLAYER_INTERACT: 'player_interact',  // use item on tile (plant seed, splice)

  /* ─── Inventory ─── */
  INVENTORY_SELECT: 'inventory_select',
  ITEM_DROP:        'item_drop',

  /* ─── Server Responses ─── */
  WORLD_STATE:     'world_state',      // initial world data sent to client
  TILE_UPDATE:     'tile_update',      // server confirms a tile changed
  ACTION_REJECT:   'action_reject',    // server denied the action
  INVENTORY_UPDATE:'inventory_update', // server updates client inventory
  DROP_ITEM:       'drop_item'         // item spawned in world
});
