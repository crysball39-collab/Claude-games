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
| Draw a bow, and loose | hold the red button (DRAW), let go | hold left click or F, let go |
| Choose the move | slide off the button left, up, right or down | right click or Q for the heavy one (fists and blades) |
| Aim a gun, a bow or a crossbow | AIM (on, and again for off) | hold right click or Q |
| Pick up / drop / reload | PICK UP, DROP, RELOAD | E, G, R |
| Holster or draw | HOLSTER / DRAW | H |
| Grab, drag or let go | GRAB (DRAG, LET GO); ATTACK throws what you carry | Z |
| Special abilities menu | ABILITIES (beside SPAWN) | M |
| Use the chosen ability | POWER | B |
| Weapon slots | tap a slot | 1 to 5 |
| Sandbox menu | SPAWN | Tab |
| Doctor mode | DOCTOR, then tap a person | X, then click a person |
| Say something | TALK | T |
| First or third person | VIEW | V |
| Players on a server | the chip at the top right | N |
| Pause | PAUSE | Esc or P |
| Get into a car | DRIVE (or CARJACK) at a front door | E |
| Drive | GAS and BRAKE pedals; BRAKE held at a standstill reverses | W / up, S / down |
| Steer | the left and right arrows | A / D, left / right |
| Handbrake / horn / out | HANDBRAKE, HORN, EXIT | Space, H, E |

## What is in it

**Fighting.** Fists and each melee weapon have four different attacks. Tap the attack
button repeatedly for the combo, or slide off it to pick one.

| | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| Fists | jab | cross | uppercut | kick |
| Knife | slash | backhand slash | stab | overhand plunge |
| Machete | chop | backhand | cleave | leg sweep |
| Sword | slash | backhand | thrust | overhead cleave |
| Crowbar | swing | backhand | jab | overhead smash |

The sword has the longest reach of anything you can swing and takes limbs off like the
machete; the thrust goes in deep. The crowbar does not cut: it breaks bones, smashes
wooden boards, dents cars and breaks their windows, and rings when it lands.

The M1911 holds seven rounds and fires as fast as you tap; the Glock-19 holds fifteen
rounds of 9 mm, hits a little less hard and comes back on target a little faster. The AK-47 holds thirty, fires
automatically and goes through people. The M4A1 is a black carbine that fires in fast
bursts while the trigger is held; the AR-15 is its civilian cousin, with a longer barrel
and a fixed stock, and fires once for each pull. Both take a 30-round magazine and their
rounds go through a light vest. Bullets leave holes in walls, crates, cars and
bodies, and go on through what they can: out of the far side of a person (an exit wound),
of a crate (a bigger hole, splintered outward) and of a car (two door skins, the far one
torn out in bright petals), losing power each time, and on into whatever is behind.
Reloading is done by hand and takes as long as
it looks: the gun comes in to the chest, the empty magazine drops to the ground, the left
hand fetches a full one from the belt and seats it, and the action is racked. You cannot
fire until it is finished.

**Aiming.** With a gun, a bow or a crossbow in your hand there is an AIM button over
RELOAD (on a keyboard, hold the right mouse button or Q). It brings the gun up to your
eye: the view closes in over your shoulder and zooms, the crosshair tightens, you walk
instead of running, and the rounds go much closer to where the crosshair is than they do
from the hip. AIM again and you lower it.

**Shooting from the ground.** Knocked flat with a gun in your hand, you are not out of
it. AIM, or just pull the trigger, and your arm comes up from where you lie, the gun
pointed wherever you look, both hands on it, and it fires, a little less steadily than
standing. You stay down while you hold it up; lower it and you get up. Everyone else with
a gun does the same: a police officer knocked over in a gunfight, or anybody with a gun
who has been hurt and is down, lies there and shoots back at whoever they were fighting,
holding fire while somebody else is in the way, and gets up again a few seconds later. A
bow needs you on your feet to draw it.

**Black powder.** Three guns from before cartridges, each loaded with one shot.
The *musket* is a flintlock: pull the trigger and the flint strikes, the priming in the
pan flashes and smokes, and a beat later the charge goes off and a .75 lead ball leaves
the barrel in a great cloud of white smoke. The ball is big, soft and slow: a large
hole, a hard shove; a light vest catches it less than half the time, a medium one nearly
always (and the wearer feels it like a hammer), and a plate stops it. Now and then the priming fizzles without setting off the charge:
"a flash in the pan", and the gun is still loaded. The *arquebus* is older still, a
matchlock: a lit match smoulders on the lock the whole time it is in your hands, and
dips into the pan when you fire, a little slower than a flint and a little more likely to
fizzle. The *blunderbuss* is a short flintlock with a flared muzzle that throws a
handful of shot: fourteen small pellets in a cone, each a small hole, terrible close up,
stopped by any vest. Loading them is the real drill and takes eight seconds or so:
the gun is stood up in front of you, a paper cartridge comes out of the pouch and is
bitten open, the powder and the ball are poured down the muzzle, the ramrod is drawn
from under the barrel and driven down it three times, put back, and the pan primed and
the lock cocked. The left hand goes to the muzzle and to the lock exactly, wherever the
gun is. When you aim one, the left hand holds it out along the stock.

**The bow and the crossbow.** The bow is a recurve, held in the left hand with an arrow
on the string, and with it in your hand you stand side on to the mark. Hold the trigger
and the right hand draws the string back to the jaw (DRAW shows how far; a full draw
takes most of a second); let go and the arrow flies, faster and harder the further it
was drawn. Let go before it is a fifth drawn and the string is let down again, the arrow
still on it. Then the right hand reaches back over the shoulder to the quiver for the
next one. An arrow falls as it flies, and the bow sends it up as far as it needs to come
down where the crosshair is: a long shot goes up and drops in. The crossbow is held like a rifle and shoots a bolt on the
trigger, flat and fast and harder than an arrow; then it takes three seconds or so to load
again: the nose goes down, the string is hauled back on to the latch, click by click, and
a bolt is laid in the groove.

An arrow or a bolt goes into whoever it reaches and stays in, deep, moving with them
wherever they go, ragdoll and all. It sticks in wood (a crate, a wooden wall) and in the
ground if it comes down steeply, and glances off buildings, steel, cars and car glass and
falls. A light or medium vest stops an arrow about half the time, a S.W.A.T. plate every
time; a light helmet turns most of them and the heavier helmets nearly all. Anybody who
sees it knows it was an arrow.

**Special abilities.** ABILITIES, beside SPAWN, opens a menu of them. Tap one and the
POWER button uses it; on a keyboard B does. POWER sweeps dark while it gets ready again.
Nobody watching takes any of it calmly, and the police treat it like any other attack.

**Grabbing and dragging.** GRAB (Z) takes hold of whatever is under the crosshair and in
reach, or the nearest such thing in front of you: a crate, a lamp, a generator, a wall or
a beam that has come loose, a limb that has come off, or somebody lying on the ground who
is out cold or dead (nobody on their feet). You step up to it, bend and crouch for
anything low, and your arm reaches for it, the hand open; then the fingers close round
it. A person is taken by the wrist, the ankle or the collar, whichever is nearest where
you reached (by the collar with both hands, if both are free). Anything light is picked
up and carried in front of you, in both hands if they are free, and ATTACK throws it.
Anything heavy is dragged: your arm stretched out to it, it slides along the ground
after you, and you go no faster than its weight allows. A gun in your other hand still
fires. GRAB again lets go; so does falling down, and somebody you are dragging who comes
round pulls free. Bare hands leave prints, and anybody who sees you dragging a body will
remember it, and an officer who sees it will come for you.

**Carrying.** Whatever you are not holding rides on you where it would: the M1911 in a
holster on the right hip, the Glock in a shoulder holster under the left arm, the knife
in a sheath on the left hip, the sword in a scabbard on the left hip and the crowbar
through the belt on the right, the machete, the rifles, the muskets, the crossbow, the
flamethrower and the frost thrower across your back, the bow slung across it with the
quiver over the right shoulder, the rope and the wire hung on your belt. HOLSTER puts away what is in your hand and DRAW brings it back, with the
reach that takes. People are frightened of a weapon in the hand, not one put away.

**The light vest.** Black, over the chest and the belly. It stops a pistol round and a
slash (you get the bruise, and perhaps a cracked rib, instead), takes the edge off a
stab, and only slows a rifle round. It covers nothing else.

**The light helmet.** A black shell over the skull, open at the face. It takes most of
a blow to the head, or a fall on to it; turns a slash; turns rather more than half of
the pistol rounds that hit it, and takes a little off a rifle round. A shot in the face
is a shot in the face.

**Medium and S.W.A.T. armour.** The medium vest is olive drab and covers the whole
torso, hips and groin included, with stab panels: it stops pistol rounds and slashes
anywhere on the trunk, stops some stabs, and a rifle round still goes through it. The
medium helmet is a ballistic shell down over the ears and the nape: it stops nearly every
pistol round, sometimes a rifle round at an angle. The S.W.A.T. vest is a 9.5 kg plate
carrier: plates front and back over the chest and belly stop rifle rounds (you are left
with the bruise and maybe a broken rib), soft armour at the sides does not, and a
collar, shoulder pads and a groin flap stop pistol rounds where they are. The S.W.A.T.
helmet adds a clear visor over the face: it stops most pistol rounds, stars with each
one, and after three is crazed glass that stops nothing. Put on one of a kind you are
already wearing and you swap it, leaving the old one where the new one lay. A vest or
helmet that is not thin stops taser probes.

**The S.W.A.T. team.** Four of them from the sandbox, in black: plate carriers,
visored helmets, an M4A1, a Glock-19, a taser and cuffs each. They are police, and
behave as police, but go for the rifle first. At two stars it is the S.W.A.T. team that
comes out of the station.

**Cars.** Every car in the city is a real one: the traffic, the cars parked in the lot
and the patrol cars outside the station, plus any you spawn. The windows are glass you
can see through, at the seats, the dashboard, the steering wheel and whoever is sitting
there: every car in the traffic has a driver, sometimes a passenger. Walk up to either
front door and DRIVE gets you in; if somebody is at the wheel it is CARJACK, and they
are dragged out, frightened and angry, and somebody calls the police. Inside, the
controls are the two pedals (GAS; BRAKE, which once you have stopped reverses), the
HANDBRAKE, which locks the back wheels and lets the tail step out, the left and right
arrows, the HORN (which, in a police car, also works the lights and the siren) and the
door. At speed, getting out is a fall onto the road.

A car hits walls, posts, other cars and people, and every impact is a change of speed
at the point of contact; that is what decides the damage. At 15 km/h the bumper dents.
At 50 the front folds up half a metre, the bonnet buckles, the windscreen stars and the
engine is badly hurt. Damage shows as smoke from the engine: light grey when it is
lightly damaged, grey when worse, dark grey when it is nearly finished and running rough.
At 80 or 90 there is nothing left: the engine bay catches fire, and a few seconds later
it explodes. Bullets hole the metal and go on through (into whoever is in the seats),
star the windscreen, burst the side windows and the tyres; enough rounds in the engine
set it alight; a flamethrower sets it alight. An explosion throws the wreck into the
air, scatters burning pieces, blows out windows nearby, and throws, burns, cuts and
sometimes dismembers anyone close; other cars near it take it too, and may go up in turn.
A wreck cannot be driven.

People are knocked down by a car coming at them, dent it, and at speed come up over the
bonnet into the windscreen. Anyone lying in the road is driven over: a wheel carries a
third of a tonne, and that breaks what it crosses. A driver knocked off their lane stops,
looks at the damage, and either drives back into the traffic or gets out; someone
running for their life may get into an empty car and drive it away. Drivers who are shot
or knocked out stay slumped in their seats, and can be pulled out. Wreckage is cleared
from *Clean up -> Cars*. After dark, headlights light the road.

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

**The flamethrower.** A wand with a fuel canister under it and a pilot light at the
nozzle, ten seconds of fire to a canister, seven metres. It throws a stream of burning
fuel that arcs down as it goes, splashes where it lands and burns on the ground for a few
seconds where it pools. Whatever it touches catches: people (see *Burns*), wood (a crate
burns for half a minute and falls apart; a wooden wall catches, chars and burns away cube
by cube, upward), and steel only gets hot, glowing orange. RELOAD swaps the canister.

**The frost thrower.** The flamethrower's opposite: a white wand on a tank of coolant, ten
seconds of spray to a tank, six metres. It throws a cone of freezing mist. Whoever it
reaches is frosted (see *Cold*); somebody on fire is put out at once, and so are burning
crates, burning walls and a car whose engine is alight. It frosts walls, cools hot steel,
and leaves patches of ice on the street that last half a minute or so. Walk across ice
and you are fine; hurry over it and a foot goes, the surer the longer you keep it up.
RELOAD swaps the tank.

**Walls and beams.** A wooden wall (boards 10 cm thick), a steel wall (a ribbed plate),
and a short and a large steel I-beam are each built of cubes a few centimetres across,
and come apart a cube at a time. A round punches out the cubes it goes through and comes
out of the far side of wood in a bigger, splintered hole, tearing out more on its way
out than on its way in, and on into whatever is behind; a pistol round dents steel and
only gets through where it hits the same place again, while a rifle round goes through
the steel wall. A beam takes a couple of rounds to each cube. A machete chops cubes out
of wood; fire burns them. When what is left falls into separate pieces, each is a thing
of its own: walls stand where they are put, and so does any piece of one still standing
on the ground, but a piece joined to the ground by nothing falls; a beam cut through is
two beams. Walls and beams hide people from each other, except through the holes in them.

**Rope.** TIE fastens one end to whatever is under the crosshair and within reach (a
person, a crate, a wall, a beam, a lamp, a weapon lying about, the ground, the side of a
building) and TIE TO fastens the other. It is as long as the gap was: slack, it hangs in
a curve; pulled tight it goes straight and holds. A crate on a rope behind somebody is
dragged along; somebody tied to a wall, a beam, a generator or the ground gets no further
than the rope lets them, and is yanked off their feet if they run at the end of it; a
body on the ground is held or dragged by the physics. Pulled too hard it snaps; a blade
across it cuts it, and so, sometimes, does a round. The heavy attack unties the rope
nearest the crosshair.

**Wire, lights and the generator.** The generator is a petrol engine on a frame: walk up
to it and START it, and it runs, puttering, smoking at the exhaust, until you STOP it or
it is shot to pieces. Power goes from it along wire: WIRE one thing, WIRE TO another, an
orange extension cord with plenty of slack (it pulls out of whatever it is plugged into
long before a rope would break; the heavy attack unplugs it). A light bulb and a
floodlight on its stand light when they are wired to a running generator, and pass the
power on, so one generator can feed a string of them; the floodlight also has its own
switch. Steel carries it too: a beam or a steel wall wired to a running generator is
live. Wood and rope carry nothing. Glass breaks: a bulb dropped, kicked, trodden on, hit
or shot is done for, and so is a floodlight's lens if a round finds it. The lights near
you light the street for real.

**Electricity.** Somebody with a live wire clipped to them, or a hand or a foot on live
steel, is where it goes to earth. Every muscle locks: they cannot let go, they go over
stiff and shaking and cannot breathe, it burns where it goes in, and the longer it lasts
the likelier the heart is to lose its rhythm and stop. It ends when the generator stops,
the wire comes off or is cut, or they fall clear of what they were touching.

**The sandbox menu** spawns humans (one or five), police officers, a S.W.A.T. team,
crates, the wooden and the steel wall, the short and the large steel beam, a light bulb,
a floodlight and a generator, a car, a police car and a van; the rope, the wire, the
light, medium and S.W.A.T. vests and helmets, handcuffs and the poison syringe; the taser
and sixteen weapons (fists aside: the knife, the machete, the sword, the crowbar, the
M1911, the Glock-19, the AK-47, the M4A1, the AR-15, the musket, the arquebus, the
blunderbuss, the bow, the crossbow, the flamethrower and the frost thrower). It can clear away blood, bodies,
objects or cars, or patch you up.

**Bodies.** Every person is seventeen rigid parts on sixteen limited joints, driven by
muscles with real torque limits. Each hand has four fingers and a thumb, in two segments
that turn at the knuckle and the middle joint: closed round a grip, a trigger finger
apart from the rest, balled into a fist, open and spread when the hands go up. A light blow is a flinch. A harder one is a stumble:
the body is handed to the physics and the legs try to get back under it. Harder still
and it is a ragdoll, which gets up again if it can, crawls if it cannot walk, and lies
still if it cannot do either. People crouch, jump, duck at gunshots, vault crates and
leap out of the way of cars.

**Pushing.** Walk into somebody and keep walking and you push them back ahead of you,
a step at a time, a little slower than you walk; they keep facing you and tell you what
they think of it, and kept up long enough it takes their feet from under them. Run into
somebody and they are knocked over, or at least sent staggering.

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
crates, cars (paint and glass), other people, the blade that did it and the hand that
held it, a pistol on somebody's hip. Pools that grow into each other become one pool, and
over the next few minutes the blood on the ground goes dark as it dries. Somebody
bleeding who is dragged, or crawls, leaves a smear the way they went. Where a part came
off, the stump is a ring of torn muscle standing proud of the cut with the end of the
bone in it, on both sides of the cut; a head or a trunk that bursts throws bone, brain,
gut and rib with the blood.

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
- *Shock* builds with blood loss, injury and burns.

**Burns.** Fire burns a person part by part, the clothes first and then the skin under
them, and the flames creep from one part to the next. Somebody on fire runs, screaming,
and then (if they think of it) drops and rolls, which puts it out fastest; otherwise it
burns until the fuel on them is spent. A burn is first degree (red), second (blistered,
the most painful) or third (charred: the nerves are gone, though never the edges).
Plasma weeps out through burnt skin, burns bring on shock and cold, and flames round the
face burn the airway, which swells shut. Doctor mode lists every burn by its degree and
how much of the skin is burnt in all.

**Cold.** Frost works on a person part by part, as fire does: rime forms on the clothes
and the skin, the part stiffens, and ice that stays on frostbites the skin under it (first
degree, white and numb; second, blistered; third, frozen through). Legs iced over slow
somebody to a shuffle; iced all over, they freeze stiff and go over like a statue. A body
under ice cools: they shiver, then they are confused (below 33 degrees), then out (below
30), and at about 25 the heart stops. A limb frozen through is brittle, and a hard blow, a
round or a blade breaks it off in a burst of ice. Ice thaws, faster near a fire, and the
rime goes with it; frostbite stays. Doctor mode lists the frostbite by degree, whether
they are iced over or frozen stiff, and hypothermia.

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

**Voices.** Everyone has about 1,430 scripted lines to draw on, chosen by what is
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

**Accounts.** The game opens on SIGN IN / SIGN UP: an email address (a Gmail address is
fine), a password and, for a new account, the name other players see; or PLAY AS A GUEST.
Gmail ignores dots, capitals and anything after a plus in an address, and so does the
game. Neither the address nor the password is kept as typed: an account is filed under a
SHA-256 hash of its address, and the password only as a salted PBKDF2 hash. On claude.ai
an account is kept in your own private part of the page's store (nobody else can read it,
the page's owner included); for someone the page lets read but not write, and in a copy of
the game opened on its own, it is kept in that browser. Nothing sends email, so a
forgotten password cannot be reset. The title screen says who is signed in, with SIGN OUT.

**Multiplayer.** MULTIPLAYER on the title screen, when the game is open on claude.ai, lists
the servers people are hosting right now, each with its name, how many players are on it,
and your ping to it (a real round trip, measured); JOIN one, or HOST your own (a name, up
to 16 players). Everyone on a server is a real person with the game open, playing through
the page's live room on claude.ai, so the people you play with are the people the page is
shared with.

- **Shared:** every player, exactly: their own game sends where each part of their body is,
  fifteen times a second, with what they hold and wear, their armour and how they are,
  and the others draw a stand-in that follows it. Blows, rounds, arrows, flames, frost,
  tasers, cars and powers that land on a stand-in are sent to the player it stands for,
  whose own game takes them; what that does to them comes back with their body. Gunshots,
  arrows and powers are seen and heard by everyone. Cars go with whoever
  drives them. What anybody says (TALK) shows over them and in the chat; deaths go in the
  kill feed with who did it and with what. A name and a health bar over every other
  player; the chip at the top right (or N) lists the players with kills, deaths and pings.
- **The host** is whoever has been on the server longest, and only the host spawns things
  there. When the host leaves, the next player in line hosts it and it stays in the list.
- **Not shared, for now:** the city's own people, the police, the traffic and parked cars,
  and anything spawned or lying about: each player has their own. Fights with your own
  city's people happen only on your screen.
- **Not here:** a copy of the game opened on its own has no room to play through, so it is
  single player.

**The police.** The station is across the road from the far side of the park: a
forecourt with two patrol cars, a lobby you can walk into with a front desk and a cell,
and four officers, one at the desk, two at the door and one walking the beat. Each wears
a vest and carries an M1911, a taser, a pair of handcuffs and a fingerprint scanner on
their belt.

They know nothing they have not seen or been told. What they know about you is your
*wanted level*, shown under your vitals: up to five stars.

- *One star*: they want you in handcuffs. You are told to stop; stand still, or put
  your hands up, and one officer cuffs you while the others cover. Run, keep fighting or
  ignore them and you are tased first.
- *Two stars*: you have used a gun, a bow, a blade, fire, frost or a live wire on
  someone, killed someone, gone for an officer, or blown up a car. They shoot, and
  standing still does not stop them. It is the S.W.A.T. team that comes out of the
  station, and patrol cars come after you: two officers in each, lights and siren going,
  sent from somewhere you cannot see. They drive the streets to wherever you are (the
  traffic slows and lets them by), follow you if you drive, and pull up when they reach
  you or you stop; then both get out and come for you.
- *Three stars*: you have killed an officer, or kept on. A police helicopter comes in
  high over the city and down to work. One kind circles you with two S.W.A.T. sitting in
  its open doors, and whichever door faces you shoots at you. The other finds somewhere
  open near you, hovers, drops a rope from each door, and four S.W.A.T. come down them two
  at a time; then it pulls the ropes in and leaves. From up there they see you unless a
  building is in the way, and at night a searchlight follows you. It can be shot down:
  enough rounds and it smokes, burns and comes down spinning, and a round through the
  pilot does the same; where it lands it blows up, and whoever is still in it is thrown
  out. Anyone shot on the rope lets go of it.
- *Four stars*: black S.W.A.T. vans as well, two in the cab and two standing on the steps
  down its sides holding the rail, who jump down as it slows; and S.W.A.T. teams coming on
  foot from out of sight. The streets clear of traffic.
- *Five stars*: all of it, more often, and two helicopters at once.

Every crime they hear of while you are wanted is held against you, each one once however
many saw it or rang in about it, and enough of it is another star: a second killing is a
third star; killing an officer is three stars at once; blowing up a police car or
bringing down their helicopter counts for a great deal.

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
station while you are wanted. Out of their sight (the helicopter's included) for long
enough, the stars go out one at a time, more slowly the more of them there are, and what
was sent after you goes home. Being arrested clears them, and so does dying. (If the prisoner is you, they
leave you where you are in cuffs. This is a sandbox: tap CUFFED in the weapon bar and
they come off.) They stop shooting when you are down, do not fire with a bystander in
the way, and reload before they holster. Somebody else they arrest is walked back to the
station and into the cell. A post left empty is filled again in time. An officer who is
past caring can be relieved of their pistol. *Pause -> Settings -> Cheats -> Police
ignore you* turns all of it off.

**Time of day.** *Pause -> Settings -> Time of day*: the grey afternoon, dusk, or night.
At night the sky goes dark, windows are lit from inside, and every street lamp throws a
pool of light on the pavement under it; the lamps, the fires and the floodlights you put
out yourself are what you see by.

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
| `src/human/` | the rig, the animation and attack clips, the medical model, armour, the human itself |
| `src/mind/` | senses, memory and emotion; behaviour; scripted lines; speech; the Claude connection; the police (`police.js`) and who they send after you (`response.js`) |
| `src/net/` | accounts (`accounts.js`); multiplayer over the claude.ai room (`multiplayer.js`: the server list, hosting and joining, other players' stand-ins, hits sent to their owners); a body's pose in a few hundred characters (`pose.js`) |
| `src/combat/` | weapons and ballistics; arrows and bolts (`arrows.js`); frost and ice (`frost.js`); blood, wounds and dismemberment |
| `src/world/` | the city, its pavement network; cars (`car.js`: the model, glass, dents, damage) and everything with wheels (`traffic.js`: driving, police pursuit, collisions, crashes, explosions); police helicopters (`heli.js`) |
| `src/render/` | instanced boxes, decal batches, procedural textures |
| `src/ui/` | the HUD, the sandbox menu, doctor mode, signing in (`authui.js`), the multiplayer screens (`mpui.js`) |
| `tools/` | tests, the browser harness, the swing solver, the build |
