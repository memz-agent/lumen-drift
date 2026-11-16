# Lumen Drift

Lumen Drift is an original 2D canvas arcade game about piloting a small light-orb through procedurally generated caverns in the dark: you drift on momentum, gather every light shard in the cave before the timer drains, and thread past void mines and patrolling drones that snuff out your light. Each cleared cavern opens a deeper one — more shards, less time per shard, more hazards — and the run only ends when your three lives are gone, so the game is a score chase across endless, ever-harder levels. Everything is hand-written vanilla JavaScript with procedural WebAudio sound; there are no libraries, no assets and no network requests.

## How to play

Open `game/index.html` in a desktop browser (or serve the `game/` folder with any static file server, e.g. `node serve.ts` from this repo) and press Enter or click to start. Collect **all** the glowing shards before the timer bar empties to clear the level; leftover time converts to bonus points. Touching a void mine or a drone costs a life, and letting the timer run out costs a life and restarts the cavern. Hard wall impacts bounce you and cost a few points. You have 3 lives — lose them all and the run ends on the game-over screen, where Enter restarts.

## Controls

- **WASD / Arrow keys** — thrust (the orb keeps its momentum, so feather the keys to drift)
- **Mouse hold** — thrust toward the pointer
- **Space / Shift** — dash burst (short cooldown, shown on the HUD)
- **P / Esc** — pause
- **M** — mute / unmute the procedural sound and music
- **Enter / click** — start, confirm, restart
