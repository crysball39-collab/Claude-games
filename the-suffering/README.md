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
automatically and goes through people. The M4A1 is a black carbine that fires in fast
bursts while the trigger is held; the AR-15 is its civilian cousin, with a longer barrel
and a fixed stock, and fires once for each pull. Both take a 30-round magazine and their
rounds go through a light vest. Bullets leave holes in walls, crates, cars and
bodies, and exit wounds on the far side. Reloading is done by hand and takes as long as
it looks: the gun comes in to the chest, the empty magazine drops to the ground, the left
hand fetches a full one from the belt and seats it, and the action is racked. You cannot
fire until it is finished.

**Carrying.** Whatever you are not holding rides on you where it would: the pistol in a
holster on the right hip, the knife in a sheath on the left, the machete and the rifles
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
or standing with their hands up, and it takes a moment on one knee beside them. Someone
on the ground is rolled on to their front first, away from whoever is doing it, arms up
past the head so that neither is trapped, and the arms are then brought round along the
ground and up behind the back; the cuffs go on when the wrists meet. Wrists
are held together behind the back, on their feet or as a ragdoll, by a real joint. In
cuffs a person can walk and run, clumsily, and can neither hit anybody nor carry
anything; what they were carrying is taken off them. PICK UP beside them takes the cuffs
off again.

**The poison syringe.** One lethal dose. INJECT puts it into whoever is within reach in
front of you, in the arm or the shoulder. They know they have been stuck with something.
The poison is taken up over most of a minute: sick and sweating within seconds, then
dizzy, confused and staggering, then down, then out, and then their breathing slows and
stops. A needle leaves no fingerprints.

**The sandbox menu** spawns humans (one or five), police officers, crates, the light
vest, the light helmet, handcuffs, the taser, the poison syringe and the six weapons
(fists aside: the knife, the machete, the M1911, the AK-47, the M4A1 and the AR-15), and
can clear away blood, bodies or objects, or patch you up.

**Bodies.** Every person is seventeen rigid parts on sixteen limited joints, driven by
muscles with real torque limits. Each hand has four fingers and a thumb, in two segments
that turn at the knuckle and the middle joint: closed round a grip, a trigger finger
apart from the rest, balled into a fist, open and spread when the hands go up. A light blow is a flinch. A harder one is a stumble:
the body is handed to the physics and the legs try to get back under it. Harder still
and it is a ragdoll, which gets up again if it can, crawls if it cannot walk, and lies
still if it cannot do either. People crouch, jump, duck at gunshots, vault crates and
leap out of the way of cars.

**Solid.** Bodies do not pass through each other, or through themselves. Lying,
falling or heaped on each other, every part of every body collides with every other part
it is not jointed to. On their feet, an arm the animation would put into the body (a
reload, a guard, a cower) is turned at the shoulder and elbow until it is clear, and kept
out of anyone standing close. A fist or a foot stops at the body it lands on, early if
they are standing close, and the striking arm bends rather than going into anybody in
the way. People keep room between them for their feet as well as their shoulders, stop
pressing when they walk into someone, and take shorter steps in a crush. A body lying in
the way has its arms and legs stepped on or pushed aside, and its back and head walked
round. Getting up, every joint turns from where it was to where it is going, so limbs
swing round instead of passing through (an arm that was lain on goes on ahead, clear of
the body); and someone who would get up into a person standing next to them, or into
another person getting up, waits their turn. A heap of bodies comes to rest on itself,
not in itself.

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

Blood runs. From a wound that keeps bleeding it runs down whatever is below it, shirt
to belt to trouser leg, part on to part, and drips off where it runs out; a wound that
goes on bleeding goes on feeding it. Blood thrown on a wall runs down the wall. A blade
that has been used drips from its tip. Clothing round a wound soaks the blood up in a
stain that spreads with what has been lost, and clothing that lies in a pool soaks from
underneath; cloth that has taken up a great deal goes dark all over.

**State.** Alongside the injuries, the body keeps track of how it is doing.

- *Stamina* is spent running, jumping and fighting and comes back with rest, more slowly
  for someone who has lost blood, is in pain or cannot breathe. With little left a run
  becomes a jog and a jump a hop. You have a STAMINA bar under BLOOD.
- *Adrenaline* comes up within a second or two of a fright, a fight or an injury and
  takes a minute or more to fade. It blunts pain, quickens the pulse and the breathing,
  and lets a tired body push on a little longer.
- *Poison* is taken up from where it was injected and cleared slowly by the liver. It
  brings nausea and cramps, dizziness, confusion and weakness; enough of it and they
  cannot stand, then lose consciousness, then stop breathing.
- *Dizziness* comes from being spun about, a knock on the head, blood loss, too little
  air and poison. Somebody very dizzy staggers and falls as they walk. When you are
  dizzy the picture sways.
- *Awareness* is how much of what is going on round someone they are taking in, dulled
  by concussion, dizziness, blood loss, shock, poison and lack of air. Somebody barely
  aware sees and hears much less of what is happening. When yours drops, the edges of
  the picture darken.
- *Shock* builds with blood loss and injury.

**Doctor mode.** Tap anyone, or examine yourself.

- STATUS: condition, an ECG, blood, air, pulse, pain, nausea, temperature and
  breathing; their state (awareness, dizziness, stamina, adrenaline, poison and shock);
  the six emotions (fear, anger, sadness, joy, surprise, boredom); every wound and how
  fast it is bleeding.
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

**Voices.** Everyone has about 780 scripted lines to draw on, chosen by what is
happening to them and coloured by their habits of speech, and they answer when you TALK
to them. The lines are written the way people actually talk: short, broken, repeating
themselves, swearing. Pain is mostly breath and noise and a word or two; somebody badly
hurt asks the same thing twice and does not finish sentences; somebody on the phone to
911 gives the street and what they saw. Connect them to Claude and they can say anything at all:

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
a vest and carries an M1911, a taser, a pair of handcuffs and a fingerprint scanner on
their belt.

They know nothing they have not seen or been told. What they know about you is your
*wanted level*, shown under your vitals: at most two stars for now.

- *One star*: they want you in handcuffs. You are told to stop; stand still, or put
  your hands up, and one officer cuffs you while the others cover. Run, keep fighting or
  ignore them and you are tased first.
- *Two stars*: you have used a gun or a blade on someone, killed someone, or gone for
  an officer. They shoot, and standing still does not stop them. Officers sent out at
  two stars bring M4A1s.

An officer who sees you do something gives you the stars for it there and then and tells
the others by radio. Anybody else has to ring 911: a witness steps back, gets their phone
out, and tells the station what happened, where, and, if they saw you do it, what you
look like. Somebody who only comes across a body, or someone lying hurt, rings too, but
cannot say who did it, and nobody comes looking for you. Officers are sent to every
call. At a body they kneel and press a fingerprint scanner to the hands and skin, and if
you touched the victim with your bare hands (a punch, a hand on them, taking something
off them, handcuffing them), the prints are yours: one star, and every officer searches
the city for you. A kick, a knife, a gun or a needle leaves nothing on the skin.

Officers who lose sight of you search where you were last seen, and more come out of the
station while you are wanted. Out of their sight for long enough, the stars go out one
at a time. Being arrested clears them, and so does dying. (If the prisoner is you, they
leave you where you are in cuffs. This is a sandbox: tap CUFFED in the weapon bar and
they come off.) They stop shooting when you are down, do not fire with a bystander in
the way, and reload before they holster. Somebody else they arrest is walked back to the
station and into the cell. A post left empty is filled again in time. An officer who is
past caring can be relieved of their pistol. *Pause -> Settings -> Cheats -> Police
ignore you* turns all of it off.

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
node tools/overlap.mjs   # how far body parts get inside each other, scenario by scenario
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
