/* =============================================================================
   MURDER DRONES - Uzi, N and V: who each of them is, what they look like,
   what they say, and how they arrive.

   UZI  A worker drone with a chip on her shoulder and a railgun she built
        herself. Brave, sharp-tongued, quick to anger, not one for company.
        Murder drones are what she wants to shoot most.
   N    A disassembly drone who would really rather be friends. Kind, keen,
        nervous, apologetic - and, when he has to be, very dangerous.
   V    A disassembly drone who enjoys her work far too much. Fearless,
        vicious and playful about it; anyone who is not one of hers is
        something to take apart.

   N and V come down out of the sky and crash-land, wings out. Uzi walks in
   with her railgun already in her hands.
   ========================================================================== */
import { addLines } from '../../game/lines.js';
import { clamp } from '../../core/util.js';
import { WORKER, DISASSEMBLY } from './species.js';
import { Railgun } from './railgun.js';
import { UZI_PURPLE, DRONE_YELLOW } from './look.js';

export const LOOKS = {
  uzi: { type: 'worker', eye: UZI_PURPLE, hat: 'beanie', hair: 'uzi' },
  n: {
    type: 'disassembly', eye: DRONE_YELLOW, hat: 'cap', hair: 'n', collar: true, wings: true, tail: true,
    prefs: { melee: ['claw', 'sword', 'chainsaw'], ranged: ['gunArm', 'laser', 'missile'], swoop: 0.35 },
  },
  v: {
    type: 'disassembly', eye: '#ffc93a', hair: 'v', apron: true, collar: true, wings: true, tail: true, hunter: true,
    prefs: { melee: ['chainsaw', 'claw', 'sword'], ranged: ['missile', 'laser', 'gunArm'], swoop: 0.7 },
  },
};

const UZI_LINES = {
  greet: ['Oh. Hey.', "Uzi. Uzi Doorman. You'll remember it.", "Don't make it weird.", 'What do you want?', 'Hi, I guess.', 'Ugh. People.'],
  greetFriend: ["Hey. You're still alive. Nice.", "Oh good, it's you. You're tolerable."],
  greetCold: ["Oh. It's you.", 'Great. Fantastic.', "Don't even."],
  farewell: ['Later. Or never.', 'Bye, I guess.', "Don't die or whatever.", 'I have very important things to do. Alone.'],
  smalltalk: [
    'I built a railgun in my room. What did you do this week?',
    "Everyone back home thinks I'm a disappointment. Joke's on them.",
    'This place is way less boring than the colony.',
    'You ever just want to blow something up? For science?',
    "My dad would hate this. Which is why it's great.",
    'Do you think murder drones dream? About murder?',
    "I'm not antisocial. I'm selectively social.",
    "Nobody thinks I can do anything. I'm going to prove them all so wrong.",
  ],
  compliment: ["You're... not completely terrible.", 'Okay, that was kind of cool.', "You're weird. I like weird."],
  insult: ['Wow. Cringe.', 'Did you get your personality out of a vending machine?', "You're about as useful as a broken door.", 'Even the crates have more going on upstairs.'],
  fightStart: ['You picked the wrong drone!', 'Time to make some scrap!', 'Finally, something to shoot.', "Oh, it's ON."],
  angryAt: ['You are SO dead!', 'Bad move, {other}!', "Okay, now I'm mad."],
  taunt: ['Stay down, scrap heap.', "Who's the failure now?", 'Told you.'],
  victory: ['Ha! Write that down!', "Who's the disappointment now?", 'Railgun: one. Everyone else: zero.', 'Yes! YES! I did it!'],
  flee: ['Nope! Tactical retreat!', 'Not today!', 'Okay, okay, bad plan, bad plan!'],
  beg: ['Okay! Okay! Truce!', 'Wait, wait, I take it back!'],
  hurtSmall: ['Ow! Hey!', "That's my chassis!", 'Okay, ow.'],
  hurtBig: ['AAAH! My chassis!', 'That really, really hurt!', 'Okay. Ow. Ow ow ow.'],
  shot: ["I'm hit! I'm hit!", 'Ow! My processor!'],
  railCharge: ['Charging...', 'Say hello to my railgun.', 'Hold still. This is going to be loud.', 'Three... two...'],
  seeMurderDrone: ['Murder drone! Okay. I can do this.', "That's a murder drone. Railgun time.", 'Oh no. Oh, this is it. This is my moment.'],
  killedProud: ['One less murder drone.', 'Ha! Scrap!', "That's what you get."],
  killedGuilt: ["I... didn't mean... oh no.", "That wasn't supposed to happen."],
  gunGet: ['Mine. Obviously.'],
  weaponGet: ['Ooh. I can work with this.'],
  dying: ["Tell my dad... actually, don't tell him anything.", 'This is so... embarrassing...'],
  thanks: ["Thanks. I guess. Don't make it a thing.", '...Thanks.'],
  comfort: ["Hey. You're okay. Probably.", "Don't die on me. That would be super annoying."],
  witnessDeath: ['No! No no no!', 'Oh no. Oh no.'],
  grief: ['This is so unfair.', "I should've been faster..."],
  orderedFight: ["Fine. Whatever. I'll do it.", "Oh, I've been waiting for this."],
  orderedFightFriend: ['Seriously? Fine...', 'Ugh. Sorry, {other}.'],
  acidBurn: ["It's eating me! It's EATING me!", 'Get it out get it out get it out!', "I'm melting! This is the worst!"],
  sawed: ['AAAH! Get that saw off me!', "It's cutting through my chassis!", 'NOT the chainsaw! NOT the chainsaw!'],
  clawed: ['Ow! Claws! Of course it has claws!', 'Get your claws off me!'],
  tailStabbed: ['Ow! The tail! Gross gross gross!', "It stung me! I'm going to die, aren't I?"],
};

const N_LINES = {
  greet: ["Oh! Hi! I'm N!", "Hello! Don't worry, I'm one of the nice ones!", 'Hi there! Sorry if I scared you!', 'Oh, hello! You look friendly!'],
  greetFriend: ['Hey, buddy! I missed you!', '{other}! My favourite person!', "Oh, it's you! Yay!"],
  greetCold: ['Oh. Um. Hi.', 'H-hello again...'],
  farewell: ['Bye! Stay safe! Please!', 'See you later! Try not to get taken apart!', 'Bye-bye!'],
  smalltalk: [
    'Do you think the sky here is grey on purpose?',
    "I used to be a butler drone, you know. I'm great at folding towels!",
    'V says I\'m too nice. Is that bad?',
    "Do you want to be friends? You don't have to say yes. But you could!",
    "I'm not supposed to like anyone. I like everyone. Oops.",
    'I really like your... everything!',
    'Sometimes I just want to lie in the snow and look at the sky.',
    "My wings get cold. Is that weird? That's probably weird.",
  ],
  compliment: ["You're really nice!", 'That was amazing!', "You're my favourite!", "Wow, you're so cool."],
  insult: ['Um... that was mean. Sorry. I mean, you were mean. Sorry.'],
  fightStart: ["I really don't want to do this!", 'Sorry! Sorry in advance!', "Please don't make me hurt you!", 'Okay, okay - here I go!'],
  angryAt: ["Hey! That's not okay!", 'You hurt my friend!', "Now I'm actually upset!"],
  taunt: ['Please just stay down!', 'Are you okay? Stay down, okay?'],
  victory: ["I'm so sorry! Are you okay?", 'Uh... I win? Sorry.', "Oh no, I hope that didn't hurt too much."],
  flee: ['Ahhh! Nope!', 'Running away now! Bye!'],
  hurtSmall: ['Ow!', 'Oof!', 'Hey, that stings!'],
  hurtBig: ['Ouch! That hurt my feelings AND my chassis!', 'Ow ow ow!'],
  crashLanded: ["I'm okay! I'm okay!", 'Ow. Nailed it. Mostly.', 'Hello, everybody! Sorry about the crater!', 'Ta-da! ...Sorry about your floor.'],
  morph: ['Hands, do the thing!', 'Transforming!', 'Ooh, {what}!', 'Okay! {what} it is!'],
  swoop: ['Incoming! Sorry!', 'Wheee! Oh no, the landing!', 'Flying in!'],
  tailStab: ['Sorry about the tail!', 'Tail! Sorry!'],
  killedGuilt: ["Oh no. Oh no no no. I'm so sorry.", "I didn't mean to! I didn't mean to!"],
  killedProud: ["I... I had to. I'm sorry."],
  comfort: ["Hang in there! You've got this!", "I'm here! Hold still, okay?"],
  thanks: ["Thank you! You're the best!", 'Aww, thanks!'],
  orderedFight: ['Okay... if I have to.', 'Here goes nothing!'],
  orderedFightFriend: ["But... we're friends!", "I don't want to hurt {other}!"],
  seeWorkerDrone: ["Oh! A worker drone! Hi! Please don't shoot me.", 'Hey, a new friend! Hopefully!'],
  witnessDeath: ['No! Oh no, no!', "That's... that's really bad."],
};

const V_LINES = {
  greet: ['Well, hello there.', 'Ooh. A new toy.', "Hi! Don't run. Actually, do run. It's more fun.", 'Hey there, cutie. Hold still.'],
  greetFriend: ["Oh, it's you. You get to keep your arms today.", 'Hey, you. Lucky you.'],
  greetCold: ['Ugh. You.', "Oh. You're still in one piece? Hm."],
  farewell: ['Bye! For now.', "See you later. Sooner than you'd like.", 'Run along.'],
  smalltalk: [
    'Do you ever just want to take something apart? Just to see?',
    "I'm in such a good mood. Somebody's going to regret that.",
    "N is so soft. It's adorable. And pathetic.",
    'Hold still, I just want to look at you. With my claws.',
    'I love it here. So many things to break.',
    "You're shaking. Is it cold, or is it me?",
    "Smile! It's more fun when they smile.",
  ],
  compliment: ["Ooh, you're interesting. I'll take you apart last.", 'Not bad. Not bad at all.'],
  insult: ["You'd make great spare parts.", 'Cute. Useless, but cute.', "I've met smarter toasters."],
  fightStart: ['Hehe. Gotcha.', "Let's play!", "This won't take long. Promise!", 'Ooh, finally!'],
  angryAt: ["Oh, you're going to regret that.", 'Bad idea, {other}.'],
  taunt: ["Aww, you're shaking!", 'Run, run, run!', "Get up. I'm not done.", 'Already? Boring.'],
  victory: ['That was fun! Again!', 'Aww, broken already?', 'Hehe. Next!'],
  flee: ['Tch. Fine. Later.', "This isn't over!"],
  hurtSmall: ['Hey! Rude!', 'Ooh, that tickled.'],
  hurtBig: ["Ow! You'll pay for that!", "Okay, that one hurt. Now I'm angry."],
  crashLanded: ['Did you miss me?', 'Ta-da!', 'Knock knock.', 'Surprise!'],
  morph: ["Ooh, let's try this one.", 'Time for the fun hands!', '{what}! My favourite.'],
  swoop: ['Coming for you!', 'Here I come!', 'Peekaboo!'],
  tailStab: ['Got you!', 'Little sting!'],
  killedProud: ['Oops! Hehe.', 'Next!', "That's one."],
  killedGuilt: ['...Huh. Whatever.'],
  seeWorkerDrone: ['Ooh, a worker drone. My favourite flavour.', 'A worker drone! Come here, little thing.'],
  comfort: ["Hm. Don't die yet. I'm not done with you."],
  thanks: ['Hm. Thanks, I suppose.'],
  orderedFight: ['With pleasure.', 'Ooh, finally!'],
  orderedFightFriend: ['Aw. Fine. Nothing personal, {other}.'],
  dying: ['No... not like this...', 'Ugh... rude...'],
};

// what everybody else says about them, once they are in the world
addLines({
  seeMurderDrone: [
    'What IS that?!', 'Is that a robot? With wings?!', 'Oh no. Oh no, that thing has a tail.', 'Nobody move. Maybe it cannot see us.',
    'Are those eyes... glowing?', 'I do not like the look of {other}.',
  ],
  droneArmFear: [
    'Your hand just turned into a {what}!', 'Is that a {what}?! Where did your hand go?!', 'Those are NOT hands!', 'What are you?!',
    'Put the {what} away. Please.', 'Okay, that is new. And terrifying.',
  ],
  burned: ['It burns!', "My skin! It's burning!", 'Aaah! Hot! Hot!', "I'm on fire!", 'That LASER!'],
  swordHit: ['AAAH! A sword!', '{other} cut me open!', 'That hand is a SWORD!', "I'm cut! I'm cut!", 'It went right through me!'],
  clawed: ['It clawed me!', 'AAAH! Claws!', '{other} raked me open!', 'Three cuts at once?!', "I'm bleeding everywhere!"],
  sawed: ['AAAAARGH! THE CHAINSAW!', "It's chewing me up!", '{other}! STOP THE SAW!', 'Turn it off! TURN IT OFF!', "It won't stop cutting!"],
  tailStabbed: ['Its TAIL stabbed me!', 'Something stung me!', 'Ow! What was that?!', 'The tail! The tail got me!'],
  boomHeard: ['What was that?!', 'Was that an explosion?!', 'Something just blew up!', 'That came from over there!'],
  railHeard: ["That wasn't a gun. What WAS that?!", 'What was THAT?!', 'Something just went through the wall!', 'The air is buzzing...'],
  laserHeard: ['What is that humming?', 'Is something burning?', 'I smell something burning.'],
  missileHeard: ['What was that whoosh?!', 'Something just flew past!', 'Incoming?!'],
  blownUp: ['AAAAH! It EXPLODED!', "My ears! I can't hear anything!", 'What was THAT?!', 'It blew up right next to me!', 'Everything is ringing...'],
  sawDroneHit: ["{other}'s hand is a {what}!", '{victim}! Get away from it!', 'Somebody stop {other}!', 'Oh god, {victim}...', 'Its hands! Look at its hands!'],
  sawTailHit: ['Its tail! It stung {victim}!', '{victim}! Watch the tail!', 'That tail has a needle on it!'],
  acidBurn: ["It's eating me!", 'Get it out, get it out!', "It's melting!", 'Something is eating me from the inside!', 'It BURNS!'],
  crashLanded: ['Hello.', 'Ta-da.'],
  morph: ['Look at this!', 'Hands, change!'],
  swoop: ['Incoming!'],
  tailStab: ['Hah!'],
  railCharge: ['Charging...'],
  seeWorkerDrone: ['A worker drone.'],
});

export const CHARACTERS = {
  uzi: {
    name: 'Uzi', species: WORKER, scale: 0.84, voice: 1.28, strength: 0.9, lines: UZI_LINES, look: LOOKS.uzi,
    traits: { bravery: 0.85, aggression: 0.6, temper: 0.8, empathy: 0.45, sociability: 0.22, curiosity: 0.8, toughness: 0.4, skill: 0.72 },
  },
  n: {
    name: 'N', species: DISASSEMBLY, scale: 1.04, voice: 0.98, strength: 1.5, lines: N_LINES, look: LOOKS.n,
    traits: { bravery: 0.5, aggression: 0.15, temper: 0.1, empathy: 0.95, sociability: 0.95, curiosity: 0.6, toughness: 0.95, skill: 0.85 },
  },
  v: {
    name: 'V', species: DISASSEMBLY, scale: 1.0, voice: 1.15, strength: 1.55, lines: V_LINES, look: LOOKS.v,
    traits: { bravery: 0.95, aggression: 0.95, temper: 0.75, empathy: 0.08, sociability: 0.5, curiosity: 0.55, toughness: 0.95, skill: 0.92 },
  },
};

/** "N", or "N 2" if there is an N already. */
function uniqueName(sb, base) {
  const taken = new Set(sb.people.map((p) => p.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

/** One of the three, into the sandbox at x: down out of the sky, or walking in with a railgun. */
export function spawnDrone(sb, who, x) {
  const c = CHARACTERS[who];
  const o = {
    name: uniqueName(sb, c.name), species: c.species, look: c.look, lines: c.lines,
    scale: c.scale, voice: c.voice, strength: c.strength, traits: c.traits, hair: 'none',
  };
  if (c.species === DISASSEMBLY) {
    const facing = x > 0 ? -1 : 1;
    const from = clamp(x - facing * 1.7, sb.left + 0.6, sb.right - 0.6);
    const man = sb.spawnStickman(from, 11, { ...o, airborne: true });
    if (!man) return null;
    man.facing = facing;
    man.vel.x = facing * 2.6;
    man.vel.y = -14;
    man.md.flight = { mode: 'crash', t: 0, x };
    man.md.wing.open = 1;
    man.md.wing.target = 1;
    sb.emit('droneIncoming', { who: man, x, y: 11 });
    return man;
  }
  const man = sb.spawnStickman(x, null, o);
  if (!man) return null;
  // she never goes anywhere without it
  const rg = new Railgun(sb, man.pos.x, 1);
  rg.owner = man;
  sb.guns.push(rg);
  rg.wear(man);
  man.weapon = rg;
  return man;
}

export const isDrone = (t) => !!(t && t.species && t.species.mod === 'murder-drones');
