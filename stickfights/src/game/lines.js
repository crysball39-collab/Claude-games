/* =============================================================================
   Everything a stickman can say, by situation. {me} is the speaker, {other}
   who they are talking to or about, {victim} someone something happened to,
   {part} a body part.
   ========================================================================== */
import { pick } from '../core/util.js';

export const LINES = {
  greet: ['Hi!', 'Hello!', 'Hey there.', 'Oh, hi {other}!', "I'm {me}. Hi!", 'Howdy!', 'Hey, {other}!', 'Hiya!'],
  greetFriend: ['{other}! Good to see you!', 'Hey, buddy!', 'There you are, {other}!'],
  greetCold: ['...hi.', 'Oh. You.', 'Hm.', 'What.'],
  smalltalk: [
    "Nice day, isn't it?", 'I like this grey.', 'The ground is very black today.', 'Got any snacks?',
    'I could stand here all day.', 'Do you ever feel a bit... flat?', 'Big fan of crates, me.',
    "What's your favourite shade of grey?", 'I had a dream I was in colour.', "Stick together, that's what I say.",
    'Have you tried standing on a crate? Life changing.', 'My knees bend both ways, you know.',
    'Sometimes I think someone up there is watching us.', 'Is it me or is the sky very grey?',
  ],
  reply: ['Ha! Yeah.', 'True.', 'Mm-hm.', 'I know, right?', 'Totally.', 'Heh.', 'Same.', 'If you say so.', 'Hah, good one.', 'Oh, for sure.'],
  sadTalk: ["I don't feel so good.", 'Everything is so grey...', 'Do you think anyone notices us?', 'I keep thinking about {absent}.'],
  sadReply: ['Aw, cheer up.', "It'll be okay.", "I'm here for you.", 'Want a hug?'],
  grumpy: ['What are you looking at?', "Don't push me.", 'I am NOT in the mood.', 'Back off.'],
  insult: ['You look like a bent paperclip.', 'Your head is too round.', 'Nobody likes you, {other}.', 'Move it, noodle arms.', "You're a waste of ink."],
  insulted: ['Say that again!', 'Excuse me?!', 'You want a problem?', "Oh, that's it.", 'Watch your mouth!'],
  insultedMeek: ['...okay.', 'Wow. Rude.', "That's mean.", 'Fine. Whatever.'],
  compliment: ['I like your hair, {other}.', "You're alright, {other}.", 'Good to see you.', "You've got nice lines."],
  thanksCompliment: ['Aw, thanks!', "That's sweet.", 'Thanks, {other}!'],
  farewell: ['See you around!', 'Later!', 'Bye, {other}!', 'Take care.', 'Catch you later.'],

  hurtSmall: ['Ow!', 'Ouch!', 'Hey!', 'Oof!', 'Ah!'],
  hurtBig: ['AAGH!', 'OW OW OW!', 'ARGH!', 'AAAH!'],
  hurtPart: {
    head: ['My head!', 'Ugh, my head...'], torso: ['Oof, my ribs...', 'Right in the gut...'],
    armA: ['My arm!'], armB: ['My arm!'], legA: ['My leg!'], legB: ['My leg!'],
  },
  broken: ["It's broken!", "My {part}! It's broken!", 'I heard it snap!'],
  betrayed: ['{other}?! Why?!', 'Hey! I thought we were friends!', 'What was that for, {other}?!'],
  angryAt: ["You'll pay for that!", 'Come here!', "That's it, {other}!", 'You want a fight?!', 'Big mistake, {other}.'],
  fightStart: ['Come on!', "Let's go!", 'Put your fists up!', "You're going down, {other}!", 'Bring it!'],
  taunt: ['Is that all?', 'Come on!', 'Too slow!', 'Get up!', 'Had enough?'],
  fear: ['Help!', 'Stay away!', 'Please, stop!', "I don't want to die!", 'Get away from me!', 'Somebody help!'],
  flee: ['Run!', 'Nope! Nope!', "I'm out of here!", 'AAAH!', 'Help!'],
  beg: ['Please! Stop!', 'I give up!', "Don't hurt me!", 'Mercy!', 'Okay, okay! You win!'],
  spare: ['Fine. Get lost.', 'Stay down, then.', "That's enough.", 'Hmph. Pathetic.'],
  witnessHit: ['Whoa!', 'Hey! Stop that!', 'Ouch...', 'Oh no!', 'Yikes!'],
  defendFriend: ['Leave {victim} alone!', 'Hey! Back off from {victim}!', 'Get away from {victim}!'],
  cheerFriend: ['Get them, {other}!', 'Go, {other}!', 'Yeah! Hit them!'],
  stopFight: ['Stop it, both of you!', 'Hey! Break it up!', 'Enough!'],
  witnessDeath: ['NO!', '{victim}?! {victim}!', 'Oh my god...', "{victim} isn't moving!", 'They killed {victim}!', 'Is... is {victim} dead?'],
  witnessDeathStranger: ['Oh no...', 'Is that one... dead?', 'Whoa...', 'Oh god.'],
  grief: ['Why... {victim}...', 'Wake up, {victim}...', "I'm so sorry, {victim}.", '{victim}... no...', "It's not fair..."],
  avenge: ['This is for {victim}!', 'You killed {victim}!', "You'll pay for {victim}!"],
  killedGuilt: ["I... I didn't mean to...", 'What have I done?', '{victim}? Get up... please.', 'Oh no. No no no.'],
  killedProud: ["That's what you get.", 'Stay down.', "Who's next?", 'Hmph.'],
  victory: ['Ha!', 'Yeah!', 'Too easy!', 'And stay down!', "Who's the boss now?"],
  weaponGet: ['Ooh, brass knuckles.', 'These will do.', "Now we're talking.", 'Nobody messes with me now.'],
  weaponSee: ['Brass knuckles!', 'Ooh, shiny.', "What's that?"],
  weaponFear: ['Uh oh. {other} has knuckles.', 'Whoa, put those away!', 'Easy there, {other}...'],
  crate: ['Nice crate.', "What's in here?", 'Knock knock.', 'Solid wood.', 'A crate! Neat.'],
  crateTop: ['King of the crate!', 'I can see everything from up here!', 'Woo!', 'Look at me!'],
  jumpOff: ['Wheee!', 'Geronimo!', 'Woo!'],
  crateHit: ['Who threw that?!', 'Where did that come from?!', 'OW! A crate?!', 'What was THAT?!'],
  bodyHit: ['Watch it!', 'Hey! Get off me!', 'Ow! Where did you come from?!', 'Look where you are flying!'],
  sorry: ['Sorry!', "It wasn't me!", 'Oof, sorry!'],
  blame: ['{other}! Did you throw that?!', 'Was that you, {other}?!', 'Very funny, {other}!'],
  throwCrate: ['Catch!', 'Heads up, {other}!', 'Eat crate!'],
  grabbed: ['Whoa! Put me down!', 'AAAH!', "I'm flying!", 'Help!', 'What is happening?!', 'Let go of me!'],
  grabbedAgain: ['Not again!', 'Why me?!', 'PUT ME DOWN!'],
  thrownLand: ['Ugh...', "I'm alive?!", 'Who keeps doing that?!', 'Ow... everything hurts.'],
  seeGrabbed: ['{victim} is flying!', 'What the...?!', 'Put {victim} down!', 'How?!'],
  pinned: ['Get it off me!', "I can't move!", "Help! I'm stuck!", 'Heavy... so heavy...'],
  crawl: ['Help... me...', "My legs... I can't stand...", 'Somebody...'],
  comfort: ['Are you okay?', 'Hang in there, {other}!', 'Let me help you up.', "You'll be alright.", "I've got you."],
  thanks: ['Thanks, {other}.', 'Thank you...', "You're a real friend, {other}."],
  dodge: ['Whoa!', 'Close one!', 'Missed!', 'Hey!'],
  bored: ['Hmm.', 'La la la...', 'What to do...', 'Hmm hm hm.', '*yawn*'],
  happy: ['What a day!', 'Life is good.', 'Hee hee.', 'I feel great!'],
  investigate: ['What was that?', 'Hello?', "Who's there?", 'Huh?'],
  sawVanish: ['Where did {victim} go?!', '{victim}?! Gone?!', 'They just... vanished.'],
  newcomer: ['Where did you come from?', 'Oh! Hello.', 'Whoa, a new one.', 'Hey, a new face!'],
  wake: ['Ugh... what happened?', 'Where am I?', 'My head...', 'Who turned the lights off?'],
  dying: ['Ugh...', 'Tell them... I...', 'So... cold...', 'Goodbye...'],
  getUp: ['Okay. Okay.', 'Ugh.', "I'm fine. I'm fine."],
  scaredOfDead: ["There's a body...", "I don't like this.", 'Is that... dead?'],
  mournStranger: ['Poor thing.', 'Rest in peace.', 'Who did this?'],
  healed: ['I feel... better?', "Whoa, it doesn't hurt anymore!", 'A miracle!'],
  hide: ['Hide!', "They won't see me here.", 'Shh...'],
  panic: ['AAAAAH!', "WE'RE ALL GONNA DIE!", 'AAH! AAH!'],
  lookAround: ['Hm?', 'Huh.', 'Anyone there?'],
  rest: ['I need to sit down.', 'Ow... just a minute.', 'Phew.'],
};

/** One line of a kind, with the names filled in. */
export function line(kind, vars = {}) {
  let list = LINES[kind];
  if (!list) return '';
  if (!Array.isArray(list)) list = list[vars.partKey] || Object.values(list)[0];
  let s = pick(list);
  for (const [k, v] of Object.entries(vars)) if (typeof v === 'string') s = s.split('{' + k + '}').join(v);
  return s.replace(/\{\w+\}/g, 'them');
}
