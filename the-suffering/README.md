# The Suffering

A 3D physics sandbox in a small city, made for a phone held sideways and playable on a
desktop too. You are dropped in a park in the middle of nine city blocks. Cars drive the
streets, people walk the pavements with minds of their own, and what happens next is up
to you.

Everything is drawn and synthesised in code when the page loads: there are no image,
model or sound files. The only library is three.js, shared with the other game in this
repository.

## Playing it

**`dist/the-suffering.html` is the whole game in one file.** Download it, open it in a
browser, press PLAY. It needs no server and no network.

To run from source instead, serve the repository root and open `/the-suffering/`:

```
cd the-suffering
npm start            # python3 -m http.server 8080, from the repository root
# then open http://localhost:8080/the-suffering/
```

### Controls

| | Touch | Keyboard and mouse |
| --- | --- | --- |
| Move | left thumb joystick | WASD (Shift walks) |
| Look | drag anywhere else | mouse (click to capture) |
| Jump / crouch | JUMP, CROUCH | Space, C |
| Attack | the big red button | left click or F |
| Choose the move | slide off the button left, up, right or down | right click or Q for the heavy one |
| Pick up / drop / reload | PICK UP, DROP, RELOAD | E, G, R |
| Holster or draw | HOLSTER / DRAW | H |
| Weapon slots | tap a slot | 1 to 5 |
| Sandbox menu | SPAWN | Tab |
| Doctor mode | DOCTOR, then tap a person | X, then click a person |
| Say something | TALK | T |
| First or third person | VIEW | V |
| Pause | PAUSE | Esc or P |

## What is in it

**Fighting.** Fists and each melee weapon have four different attacks. Tap the attack
button repeatedly for the combo, or slide off it to pick one.

| | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| Fists | jab | cross | uppercut | kick |
| Knife | slash | backhand slash | stab | overhand plunge |
| Machete | chop | backhand | cleave | leg sweep |

The M1911 holds seven rounds and fires as fast as you tap. The AK-47 holds thirty, fires
automatically and goes through people. Bullets leave holes in walls, crates, cars and
bodies, and exit wounds on the far side. Reloading is done by hand and takes as long as
it looks: the gun comes in to the chest, the empty magazine drops to the ground, the left
hand fetches a full one from the belt and seats it, and the action is racked. You cannot
fire until it is finished.

**Carrying.** Whatever you are not holding rides on you where it would: the pistol in a
holster on the right hip, the knife in a sheath on the left, the machete and the rifle
across your back. HOLSTER puts away what is in your hand and DRAW brings it back, with the
reach that takes. People are frightened of a weapon in the hand, not one put away.

**The light vest.** Black, over the chest and the belly. It stops a pistol round and a
slash (you get the bruise, and perhaps a cracked rib, instead), takes the edge off a
stab, and only slows a rifle round. It covers nothing else.

**The light helmet.** A black shell over the skull, open at the face. It takes most of
a blow to the head, or a fall on to it; turns a slash; turns rather more than half of
the pistol rounds that hit it, and takes a little off a rifle round. A shot in the face
is a shot in the face.

**The taser.** Two barbed probes on wires, good for seven metres, two cartridges before
a reload. Whoever they land in has every muscle contract at once: they go over stiff as
a board and stay that way, shaking, for five seconds, hurt and wide awake and unable to
do anything about it. While the wires are in, the trigger sends another five seconds
down them without using a cartridge. It leaves no wound; the fall may. Probes skate off
a helmet. People see a taser fired for what it is: frightening, but not a gun.

**Handcuffs.** They go on someone who is on the ground, out cold, locked up by a taser,
or standing with their hands up, and it takes a moment on one knee beside them. Wrists
are held together behind the back, on their feet or as a ragdoll, by a real joint. In
cuffs a person can walk and run, clumsily, and can neither hit anybody nor carry
anything; what they were carrying is taken off them. PICK UP beside them takes the cuffs
off again.

**The sandbox menu** spawns humans (one or five), police officers, crates, the light
vest, the light helmet, handcuffs, the taser and the four weapons, and can clear away
blood, bodies or objects, or patch you up.

**Bodies.** Every person is seventeen rigid parts on sixteen limited joints, driven by
muscles with real torque limits. Each hand has four fingers and a thumb, in two segments
that turn at the knuckle and the middle joint: closed round a grip, a trigger finger
apart from the rest, balled into a fist, open and spread when the hands go up. A light blow is a flinch. A harder one is a stumble:
the body is handed to the physics and the legs try to get back under it. Harder still
and it is a ragdoll, which gets up again if it can, crawls if it cannot walk, and lies
still if it cannot do either. People crouch, jump, duck at gunshots, vault crates and
leap out of the way of cars.

**Injury.** Underneath is a medical model: 23 bones, 14 organs, wounds that bleed at
their own rates and clot (or do not), a blood volume that depends on their size, air, pulse,
breathing, pain, shock, nausea, temperature and consciousness. People die of what would
kill them: blood loss, a destroyed brain, a stopped heart, a blocked airway.
Blades leave cuts, deep slashes and stab wounds. Limbs can be cut off, heads too, and a
limb that takes enough damage comes apart altogether. Arteries pump blood out in
streams that break up into separate drops as they fall, mark whatever they land on and
gather into pools. A drop that lands hard throws smaller ones on ahead of it; a bullet
leaves a fine spray out of the far side; a wet blade flings a line of drops off its tip
as it swings. Blood lands on, and stays on, whatever is in its way: the ground, walls,
crates, other people, the blade that did it and the hand that held it, a pistol on
somebody's hip. Pools that grow into each other become one pool.

**Doctor mode.** Tap anyone, or examine yourself.

- STATUS: condition, an ECG, blood, air, pulse, pain, shock, nausea, temperature and
  breathing; the six emotions (fear, anger, sadness, joy, surprise, boredom); every wound
  and how fast it is bleeding.
- X-RAY: their skeleton and organs, drawn from their own measurements, with fractures,
  breaks, damaged organs, wounds and missing parts marked.
- MIND: who they are, what they are doing, exactly what they can see and hear and feel
  at this moment, what they last said and what they remember.

**Minds.** Nobody in the city knows anything they did not perceive.

- *Sight* is a cone with a narrow sharp centre and a periphery that only catches
  movement, blocked by buildings, cars and crates, and lost with their eyes.
- *Hearing* works in decibels: sound falls off with distance and round corners, speech
  becomes unintelligible before it becomes inaudible, and a gunshot at arm's length
  leaves ears ringing.
- *Feeling* is what was hit, by whom if they saw it, and the body's own reports: cold,
  faint, sick, unable to breathe, unable to feel their legs.

What they perceive becomes memory and moves their six emotions, scaled by who they are
(brave, short-tempered, squeamish, patient and so on), and that decides what they do:
carry on, stare, run, cower, put their hands up when a gun is on them, fight back, or
kneel by someone who is hurt.

**Voices.** Everyone has about 530 scripted lines to draw on, chosen by what is
happening to them and coloured by their habits of speech, and they answer when you TALK
to them. Connect them to Claude and they can say anything at all:

- Open *Pause -> Voices* and paste a Claude API key. People then speak for themselves,
  unprompted, from an account of exactly what they see, hear, feel and remember. The
  key is kept in your browser's storage and sent only to the Claude API; requests are
  billed to it. You choose the model and how often requests may be made.
- Where the game is opened as a page inside Claude, TALK and the doctor's "Ask how they
  are" are answered by Claude on your own account. Nothing is sent unless you speak or
  ask. A key of your own does not work there, because such a page may not contact other
  servers; if one is set, the game notices and uses Claude's own connection instead.
- With neither, everyone keeps to their own lines. Reflex cries are always scripted, so
  nobody waits on a network to scream.

**The police.** The station is across the road from the far side of the park: a
forecourt with two patrol cars, a lobby you can walk into with a front desk and a cell,
and four officers, one at the desk, two at the door and one walking the beat. Each wears
a vest and carries an M1911, a taser and a pair of handcuffs on their belt. They keep count of what they have seen each
person do, and tell each other by radio. A weapon in your hand near them gets pistols
drawn and orders shouted. Put it away and stand still, and they hold you there a while
and then stand down. Somebody who keeps hitting people, or will not put a blade down, is
warned ("Taser! Taser! Taser!") and tased. Anybody with something to answer for who is
down, or has stopped, is handcuffed by one officer while the others cover; a prisoner is
then walked back to the station and into the cell. (If the prisoner is you, they leave
you where you are in cuffs. This is a sandbox: tap CUFFED in the weapon bar and they
come off.) Use a weapon on a person, or keep a gun pointed at an officer, and they
shoot; they stop when you are down, do not fire with a bystander in the way, and reload
before they holster. A post left empty is filled again in time. An officer who is past
caring can be relieved of their pistol.

**Cheats.** *Pause -> Settings -> Cheats -> Infinite HP.* Nothing injures you: no
wounds, no bleeding, nothing cut off, no dying, and whatever was wrong with you when you
switched it on is mended. You can still be knocked over, tased and handcuffed.

## Working on it

```
npm install          # only esbuild, for the single-file build
npm test             # physics and medical model, in Node
npm run verify       # plays the game in headless Chromium and checks every feature
                     # (node tools/verify.mjs "Taser|Handcuffs" runs only the sections named)
npm run build        # writes dist/the-suffering.html
```

`npm run verify` needs Playwright and a Chromium; see the note at the top of
`tools/harness.mjs`.

| | |
| --- | --- |
| `src/physics/world.js` | the rigid body engine: XPBD, joints with limits, muscles, sleeping islands |
| `src/human/` | the rig, the animation and attack clips, the medical model, the human itself |
| `src/mind/` | senses, memory and emotion; behaviour; scripted lines; speech; the Claude connection |
| `src/combat/` | weapons and ballistics; blood, wounds and dismemberment |
| `src/world/` | the city, its pavement network, the traffic |
| `src/render/` | instanced boxes, decal batches, procedural textures |
| `src/ui/` | the HUD, the sandbox menu, doctor mode |
| `tools/` | tests, the browser harness, the swing solver, the build |
