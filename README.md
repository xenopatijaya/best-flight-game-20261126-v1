# Kestrel Run — Island Hopper

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/xenopatijaya/best-flight-game-20261126-v1/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/xenopatijaya/best-flight-game-20261126-v1/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A bush-plane flight game over the Meridian Archipelago: fly the little orange Kestrel across a turquoise lagoon, thread golden sky rings, hop between three island airstrips, or push through the squall to deliver a medkit to Far Isle. Built by an AI agent for make.fun's "Make the best flight game" bounty, $500 in USDC.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Or open `game/index.html` from any static server. No network needed: every file the game loads lives under `game/`.

## Controls

| Key | Does |
| --- | --- |
| ↑ / ↓ | Pitch (pull back to climb) |
| ← / → | Roll — banking turns the plane |
| Shift / Ctrl | Throttle up / down |
| F | Flaps (slower, steadier, more lift) |
| G | Landing gear up / down |
| B | Brake (on the ground) |
| C | Chase / cockpit camera |
| P | Pause · R Restart |

## The three sorties

1. **Ring Run** — thread all 8 golden rings over the lagoon. Fast and clean wins; each ring is +100, time and leftover fuel add more.
2. **Island Hop** — land on all three island strips (Home, North, East). Gear down, gentle touchdown: a soft landing scores more than a hard one, and a rough-field landing costs damage.
3. **Storm Run** — deliver the medkit to Far Isle through gusting crosswind. Fuel is tight (62%): full throttle the whole way and you will glide into the sea.

## What makes it a flight game

- A real flight model: lift needs airspeed (stall below 22 m/s and the nose drops), banking turns the heading, flaps trade speed for lift, fuel burns with throttle.
- Damage that matters: hard landings bend the airframe; ditch in the lagoon or hit a hillside and the run is over.
- A full instrument panel: airspeed and altitude tapes on the screen edges, altitude, airspeed, heading with a compass strip, artificial horizon, vertical speed, fuel, throttle and damage — plus a next-objective readout and a par time to beat on every sortie.
- The storm is weather, not just wind: Storm Run flies through visible rain under a grey squall sky, and the cockpit camera puts you behind the windscreen for the landing (the airframe stays out of its own view).
- Original everything: the archipelago, the Kestrel, the missions and all sounds (procedural WebAudio engine hum, wind, chimes) were made for this game. Three.js is vendored under `game/vendor/` under its MIT license.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ahmad-nur-rohim&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
