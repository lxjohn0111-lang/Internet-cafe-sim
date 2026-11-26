# PING PALACE — Net Café Simulator

A first-person net café management game for the browser, built for **CrazyGames** with the
CrazyGames SDK v3 integrated. You run a scrappy net café: seat gamers, sell snacks, fix PCs,
punch troublemakers, mop up pigeon mess and survive a constant stream of absurd events.
Everything is a ragdoll.

There is no main menu. When the game loads you are already standing behind the counter with
customers walking in. A pause menu only appears when you leave (Esc or losing focus).

## Controls

| Action | Key |
| --- | --- |
| Move / sprint / jump / crouch | `WASD` / `Shift` / `Space` / `C` |
| Interact, pick up, give item | `E` (hold `E` to repair, mop, brew or unclog) |
| Punch | `Left mouse` (hold for a charged **MEGA punch**) |
| Throw held item / shove | `Right mouse` |
| Drop item | `Q` |
| Phone shop (anywhere) | `Tab` |
| Pause | `Esc` |

Touch devices get a virtual joystick, look-drag and action buttons automatically.

## What's in the game

- **Café loop:** customers walk in from the street, take a free PC, play, order drinks, snacks,
  coffee or pizza, litter, use the toilet, rage at lag, and pay into the register when they
  leave. Satisfaction depends on PC tier, chair, cleanliness, price, music, decor and speed of
  service, and it drives reputation (★) and future traffic.
- **Economy and progression:** hourly pricing, stock, bills every night (rent, electricity,
  internet), XP levels that unlock gear, 3 daily goals, 20 achievements, service-streak combos,
  trash trick-shot bonuses and a joke crypto exchange.
- **Building:** new PC stations arrive as boxes that you carry to glowing slots. There are 4 PC
  tiers (from Potato PC with CRT to Titan X with a curved ultrawide), 3 chair tiers, coffee
  machine, AC, sound system, neon decor, arcade cabinet, vending machine, security camera,
  fiber internet, a RoboJanitor 3000 and a VIP lounge expansion that physically smashes through
  a wall.
- **Combat and physics:** every human is a full physics ragdoll (11 bodies with cone-twist
  joints) that blends smoothly back into animation when they get up. Troublemakers rob the
  register, smash PCs, harass customers and fight back. Props, trash, ducks and keyboards are
  all physics objects.
- **Chaos director:** 25 weird events fire every 40–75 seconds, among them gravity glitch,
  disco fever, sneeze of doom, rage quit, banana streaker, pigeon invasion, power outage, PC
  fire (use the extinguisher), crypto millionaire making it rain, tiny/giant/speedrunner/alien
  customers, slippery spills, cat burglar, sprinkler malfunction, flash mob, health inspector,
  haunted PC, bobblehead virus, gang raid, duck delivery, wild streamer, pizza mix-up and chair
  rocket.
- **Day/night:** 08:00–24:00 days (about 11 minutes real time) with a moving sun, photographic
  HDR sky blending (day, sunset, night), lit windows across the street, passing cars and
  pedestrians. Sleep in the back room to end the day and see the summary.

## Tech

- **Rendering:** three.js r170. PBR materials (real wood, brick and tile textures plus
  procedurally generated plaster, concrete, asphalt, fabric, leather and granite), PMREM
  environment reflections and soft shadows. The post stack is N8AO ambient occlusion,
  UnrealBloom, ACES tone mapping, a filmic grade (vignette, grain, chromatic aberration) and
  SMAA. Quality presets (Ultra/High/Medium/Low) switch automatically based on measured FPS.
- **Characters:** Mixamo rigs, with animations retargeted between different skeletons in world
  space at load time. Extra poses (sitting, typing, gaming, cheering, rage, sleeping, sneezing,
  dancing and more) are authored procedurally as baked clips. Accessories (caps, headphones,
  glasses, crowns, antennae, a banana suit and so on) and tints give each customer variety.
- **Physics:** cannon-es for ragdolls and props. The player controller uses custom AABB
  collision and NPCs use grid A* navigation.
- **Audio:** 100% procedural WebAudio. That covers spatial (HRTF) SFX, formant-synthesised
  gibberish voices, screams and sneezes, ambience loops, and a generative music system (lo-fi,
  chill, disco, spooky) whose sound depends on whether you own the radio or the sound system.

### CrazyGames SDK integration (`src/sdk.js`)

- `SDK.init()` runs before loading. `loadingStart()` / `loadingStop()` wrap the asset load.
- `gameplayStart()` fires as soon as the café is live. `gameplayStop()` fires on the pause menu
  and the end-of-day summary, and gameplay resumes afterwards.
- **Midgame ad** plays between days (natural break). **Rewarded ad**: "Double today's income"
  on the day summary.
- Audio is muted and the simulation pauses during ads (`adStarted` / `adFinished` / `adError`).
  The SDK's `muteAudio` setting is honoured.
- `happytime()` fires on level-ups and when a streamer makes the café go viral.
- Progress is saved through `SDK.data` (cloud save for logged-in users), falling back to
  `localStorage`.
- Without the SDK (local dev / other hosts), the wrapper falls back gracefully: midgame ads are
  skipped and rewarded ads grant the reward.

## Develop / build

```bash
npm install
npm run dev        # local dev server
npm run build      # production build -> dist/
npm run package    # build + zip dist/ into ping-palace-crazygames.zip for upload
```

Upload `ping-palace-crazygames.zip` (or the contents of `dist/`) as an HTML5 game in the
CrazyGames developer portal. The build uses relative paths and works inside their iframe. The
SDK script tag is already in `index.html`.

## Project structure

```
src/
  main.js            game orchestration (loop, interactions, economy hooks, day cycle)
  sdk.js             CrazyGames SDK v3 wrapper
  core/              renderer + post-processing, physics, input, procedural audio
  world/             café layout, props, materials/textures, screens, sky, particles
  chars/             model loading + retargeting + procedural poses, NPC, ragdoll
  game/              player, customers AI, events, stations, items, nav, robot, state/data
  ui/                HUD and the in-game "PingOS" computer
public/assets/       models, textures, HDRIs
```

## Credits and licenses

- Characters *Soldier (Vanguard)*, *Xbot* and *Michelle* come from [Mixamo](https://www.mixamo.com/),
  via the three.js examples. Mixamo characters may be used royalty-free in games.
- *RobotExpressive* is by Tomás Laulhé (CC0), with modifications by Don McCurdy, via the three.js
  examples.
- Textures `hardwood2`, `brick`, `FloorsCheckerboard` and `carbon` come from the three.js
  examples.
- The HDRIs `pedestrian_overpass`, `venice_sunset` and `moonless_golf` are from
  [Poly Haven](https://polyhaven.com/) (CC0).
- All other art (props, posters, brands, signage), every sound, all music and all code are
  original to this project.

PING PALACE is an original game in the net-café-management genre. It is not affiliated with
any other game.
