/* =============================================================================
   MINECRAFT - what Steve says, and what everybody says about the blocky
   things: Steve himself, the Wither, its skeletons, withering, the totem.

   Steve is a man of few words. Most of what he has to say is about blocks,
   mobs, food, and how the sun should be down by now.
   ========================================================================== */
import { addLines } from '../../game/lines.js';

export const STEVE_LINES = {
  /* ------------------------------- hello, bye ------------------------------- */
  greet: ['Hey.', 'Oh. Hi.', 'Hello there.', 'Hi. Nice place.', '*nods*', "Hey. You're not a creeper, right?"],
  greetFriend: ['Hey, friend.', 'Good to see you.', 'Oh, hey! Still alive.'],
  greetCold: ['...', 'Hm.', 'Oh. You.'],
  farewell: ['See you around.', 'Gotta go mine something.', 'Bye. Watch out for creepers.', 'Later.', '*waves*'],
  newcomer: ["Someone new. Hope they're friendly.", 'Huh. A visitor.', 'Who goes there?'],
  reply: ['Hm.', 'Yep.', 'Makes sense.', 'Neat.', 'Huh.', "Can't argue with that.", 'Sure.'],
  thanksCompliment: ['Thanks.', "Thanks. I built it myself.", "*nods*"],
  handshake: ['*shakes hand, blockily*'],
  highFive: ['Ha. Nice.'],
  hug: ['Oh. Okay. Hug.'],

  /* -------------------------------- just talk -------------------------------- */
  smalltalk: [
    'Seen any diamonds around here?', 'I could really go for some cake.', 'I punched a tree once. Got some wood out of it.',
    'Should be getting dark soon. I need a bed.', "Don't dig straight down. Trust me.", 'Gravel. Never trust gravel.',
    'I built a house out of dirt once. It was a mistake.', 'Have you got any iron? I need iron.', 'Everything here is so... round.',
    'If you hear a hiss behind you, run.', "My pickaxe is back at base. Don't ask.", "I've seen things in the Nether. Hot things.",
    'Wheat, then bread. Simple living.', "Hmm. I wonder what's under this floor.",
  ],
  compliment: ['Nice build.', "You'd do well in a mine.", "You're all right."],
  insult: ["You're about as sharp as a wooden sword.", 'Even a zombie would be better company.'],
  insulted: ['Hm. Rude.', "That's not very nice."],
  insultedMeek: ['...Okay.'],
  sadTalk: ['I miss my dog. And my house. And my other dog.', "I lost all my stuff in lava once. Everything."],
  bored: ['I could be mining right now.', 'Hm. Nothing to build here.', "*hums a tune you'd know*"],
  happy: ['Good day.', "This is nice. No creepers."],
  investigate: ['What was that noise?', 'Hm? Something there?', "I'll check it out. Sword ready."],

  /* ---------------------------------- fights --------------------------------- */
  fightStart: ['Sword out.', 'All right. Fight.', "Let's go.", 'You picked a fight with the wrong blocky guy.'],
  angryAt: ['Hey! Not cool!', "Okay. Now I'm mad."],
  taunt: ['Stay down.', 'Respawn somewhere else.'],
  victory: ['Done.', 'Too easy.', 'Got it.'],
  defendFriend: ['Leave {victim} alone!', 'Back off from {victim}!'],
  flee: ['Nope. Too many.', 'Running!', 'Gotta get out of here!'],
  beg: ['Okay, okay! Truce!'],
  surrender: ['Whoa! Okay! Hands up!'],
  fear: ["That's... not good."],
  aimAt: ['Hold it right there.'],
  shootStart: ['Nocking an arrow.', 'Bow ready.'],

  /* --------------------------------- getting hurt -------------------------------- */
  hurtSmall: ['Oof!', 'Oof.', 'Ow!', 'Oof! Hey!'],
  hurtBig: ['OOF!', 'Oof! That took a few hearts!', 'Ow ow ow. Half a heart left, maybe.'],
  shot: ['Oof! Got me!', 'Ow! An arrow? No, a bullet!'],
  seeBlood: ["Hearts going down. Not good.", 'Need food. Need food now.'],
  checkWound: ['Okay. A few hearts left.', "I'll live. Probably."],
  getUp: ['Back up.', 'Okay. Up.'],
  dying: ['I need to... respawn...', 'Should have... brought more food...'],
  healed: ['Full hearts. Nice.', 'Good as new.'],
  wake: ['Whoa. Where am I? Did I respawn?'],
  withering: ['My hearts are going black!', 'Withering! I need milk!', "That's the Wither effect. Bad."],

  /* ----------------------------------- his kit --------------------------------- */
  eat: ['*crunch*', 'Golden apple time.', 'Need hearts.'],
  ate: ['*burp*', 'Better.', 'Mmm. Regeneration.'],
  bowSwap: ['Bow.', 'Switching to bow.'],
  swordSwap: ['Sword.', 'Sword out.'],
  noApples: ['Out of golden apples...'],

  /* ------------------------------ the things it brings ------------------------------ */
  seeWither: ['The Wither! Everybody get back!', 'Oh no. Who built a Wither here?!', 'Okay. Bow first, then sword when its armour comes up.', 'That thing nearly took my base once.'],
  seeWitherSkeleton: ["Wither skeletons. Don't let them hit you.", 'Skeletons with stone swords. Careful.'],
  killedMonster: ['Got it.', "That's one less.", 'Mob down.'],
  monsterDown: ['Good.', 'Nice one.'],
  witherDead: ["We did it. We actually did it.", 'A nether star! Worth it.'],

  /* ------------------------------ other people's things ------------------------------ */
  seeMurderDrone: ['That is not a mob I know.', 'Huh. A robot with wings. New one.'],
  'smalltalk@uzi': ["That railgun. What's it made of? Redstone?", 'You should see the stuff you can build with redstone.'],
  'smalltalk@n': ["You're very friendly for a thing with claws.", 'Do you eat? I have bread.'],
  'smalltalk@v': ['Please stop looking at me like that.', "I've fought endermen less scary than you."],
};

// what everybody else says about the blocky things
addLines({
  seeSteve: ['Why is your head a cube?', "Why is everything about you so... square?", 'Are you made of blocks?', 'Cool shirt. Very... teal.', 'Is that a sword made of diamond?!'],
  seeWither: [
    'WHAT IS THAT?!', 'It has THREE HEADS!', 'A giant flying skeleton! Run!', "It's looking at me. All of it is looking at me.",
    "That's not a normal skeleton!", 'Oh no. Oh no no no.',
  ],
  seeWitherSkeleton: ['Skeletons! Walking skeletons!', 'Those bones have swords!', 'Is that a skeleton? Why is it so tall?!', 'Stay away from the skeletons!'],
  withering: ["I'm... withering?", 'My body feels like ash!', "Everything's turning grey...", "I feel so weak...", 'What is happening to me?!'],
  mcSwordFear: ['Is that sword made of DIAMOND?!', 'Put the shiny sword away!', 'That is a very sharp, very square sword.'],
  mcSwordHit: ['AAAH! The sword!', '{other} cut me!', 'That sword is SHARP!', "I'm cut!"],
  mcSawSword: ['{other} just cut {victim}!', 'Watch out for the sword!'],
  mcBowFear: ['A bow! Get down!', "Don't shoot that thing at me!"],
  mcArrowHit: ['An arrow! I got hit by an arrow!', "There's an arrow in me!", 'OW! Arrow!'],
  mcSawArrow: ['{other} shot {victim} with an arrow!', 'Arrows! Take cover!'],
  mcBlownUp: ['AAAH! The explosion!', "My ears! I can't hear!", 'Everything went white!', 'What blew up?!'],
  mcRammed: ['It slammed right into me!', 'OOF! It rammed me!', 'The whole thing hit me!'],
  mcBoomHeard: ['What was that?!', 'Something exploded!', 'That came from over there!', 'Was that a bomb?!'],
  monsterDown: ["It's dead! It's actually dead!", 'Got it!', 'Is it over?', 'Yes! YES!', 'Phew.'],
  killedMonster: ['I got it!', 'Ha! Take that!', "That's one less monster!", "Don't mess with me!"],
  witherDead: ['The Wither is DEAD!', 'We beat it!', 'It exploded! Is it gone?!'],
  totemSee: ['Why is that glowing?', 'Uh... is it supposed to do that?', 'Everybody get back from the glowing thing!'],
  netherStarSee: ['Ooh, shiny.', 'What is that star?'],
});
