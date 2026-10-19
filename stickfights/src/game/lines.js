/* =============================================================================
   Everything a stickman can say, by situation. {me} is the speaker, {other}
   who they are talking to or about, {victim} someone something happened to,
   {part} a body part, {n} a number.
   ========================================================================== */
import { pick } from '../core/util.js';

export const LINES = {
  /* ------------------------------- hello, goodbye ------------------------------ */
  greet: [
    'Hi!', 'Hello!', 'Hey there.', 'Oh, hi {other}!', "I'm {me}. Hi!", 'Howdy!', 'Hey, {other}!', 'Hiya!',
    'Morning! Or is it? Hard to tell with this sky.', 'Well, hello.', 'Yo!', "How's it going?", 'Alright, {other}?',
    "Hi! I'm {me}, by the way.", 'Oh! Didn\'t see you there.',
  ],
  greetFriend: [
    '{other}! Good to see you!', 'Hey, buddy!', 'There you are, {other}!', 'My favourite stick figure!',
    '{other}! Where have you been?', 'Hey, pal! Come here!', 'Ah, {other}. Just who I wanted to see.',
  ],
  greetCold: ['...hi.', 'Oh. You.', 'Hm.', 'What.', "It's you again.", 'Great. {other}.', 'Ugh.'],
  farewell: [
    'See you around!', 'Later!', 'Bye, {other}!', 'Take care.', 'Catch you later.', "Don't get thrown, {other}!",
    'Stay out of trouble.', 'Mind the crates.', 'Watch out for the giant hand.', 'Right, I\'m off.',
  ],
  handshake: ['Nice to meet you.', 'Pleased to meet you, {other}.', 'Good grip!', 'A pleasure.'],
  highFive: ['Up top!', 'High five!', 'Yeah!', 'Nice one, {other}!'],
  hug: ['Come here, you!', 'Bring it in!', 'Aww, {other}.', 'Group hug! Well, two of us.'],

  /* -------------------------------- small talk -------------------------------- */
  smalltalk: [
    "Nice day, isn't it?", 'I like this grey.', 'The ground is very black today.', 'Got any snacks?',
    'I could stand here all day.', 'Do you ever feel a bit... flat?', 'Big fan of crates, me.',
    "What's your favourite shade of grey?", 'I had a dream I was in colour.', "Stick together, that's what I say.",
    'Have you tried standing on a crate? Life changing.', 'My knees bend both ways, you know. Well, they shouldn\'t.',
    'Sometimes I think someone up there is watching us.', 'Is it me or is the sky very grey?',
    'Did you see that giant hand earlier?', 'I counted my bones today. All there.', 'How many ribs do you have? I lost count.',
    'Do you think the floor goes on for ever?', 'I tried to walk through the wall once. It did not go well.',
    "I've been working on my posture.", 'I wonder who keeps dropping crates on us.', 'Knives make me nervous.',
    'They say the edge of the world is just over there.', "I'm thinking of taking up crate stacking.",
    "My mum always said I'd go far. I've gone about twenty metres.", 'Heard a thud earlier. Was that you?',
    'Do you ever just... lie down and flop?', 'I do twenty press-ups a day. Well. Sometimes.',
    'If you were a crate, what kind of crate would you be?', 'Why is everybody so pointy?',
  ],
  reply: [
    'Ha! Yeah.', 'True.', 'Mm-hm.', 'I know, right?', 'Totally.', 'Heh.', 'Same.', 'If you say so.', 'Hah, good one.', 'Oh, for sure.',
    'Ha! Never thought of it like that.', "Couldn't agree more.", 'Right?!', 'Hmm, maybe.', 'You said it.', 'No way. Really?',
    'Ha, classic.', 'Tell me about it.', "That's deep, {other}.", 'I was just thinking that.',
  ],
  sadTalk: [
    "I don't feel so good.", 'Everything is so grey...', 'Do you think anyone notices us?', 'I keep thinking about {absent}.',
    "What's the point of it all?", 'I miss {absent}.', 'Some days I just want to lie on the floor.',
  ],
  sadReply: ['Aw, cheer up.', "It'll be okay.", "I'm here for you.", 'Want a hug?', "Chin up, {other}.", "You've got me."],
  grumpy: ['What are you looking at?', "Don't push me.", 'I am NOT in the mood.', 'Back off.', 'Leave me alone.', 'Not now, {other}.'],
  insult: [
    'You look like a bent paperclip.', 'Your head is too round.', 'Nobody likes you, {other}.', 'Move it, noodle arms.', "You're a waste of ink.",
    'You walk like a folding chair.', 'Even the crates are smarter than you.', 'Nice face. Did you draw it yourself?',
    'You couldn\'t punch your way out of a crate.', 'Your knees bend the wrong way. Probably.',
  ],
  insulted: ['Say that again!', 'Excuse me?!', 'You want a problem?', "Oh, that's it.", 'Watch your mouth!', 'Take that back!', 'You did NOT just say that.'],
  insultedMeek: ['...okay.', 'Wow. Rude.', "That's mean.", 'Fine. Whatever.', 'I have feelings, you know.', 'Why would you say that?'],
  compliment: ["I like your hair, {other}.", "You're alright, {other}.", 'Good to see you.', "You've got nice lines.", 'Great posture, {other}.', "You're my kind of stick figure."],
  thanksCompliment: ['Aw, thanks!', "That's sweet.", 'Thanks, {other}!', 'You\'re too kind.', 'Stop it, you.'],

  /* ---------------------------------- hurting --------------------------------- */
  hurtSmall: ['Ow!', 'Ouch!', 'Hey!', 'Oof!', 'Ah!', 'Ugh!', 'Ow, ow.', 'Hngh!'],
  hurtBig: ['AAGH!', 'OW OW OW!', 'ARGH!', 'AAAH!', 'THAT HURT!', 'AAARGH!'],
  hurtPart: {
    head: ['My head!', 'Ugh, my head...', 'Right on the noggin!'], torso: ['Oof, my ribs...', 'Right in the gut...', 'Winded me...'],
    armA: ['My arm!', 'Ow, my elbow!'], armB: ['My arm!', 'My shoulder!'], legA: ['My leg!', 'My knee!'], legB: ['My leg!', 'My shin!'],
  },
  broken: ["It's broken!", "My {part}! It's broken!", 'I heard it snap!', "My {part}! It's bent the wrong way!", 'Something cracked!', "I can't move my {part}!"],
  brokenRibs: ['My ribs! I can\'t breathe...', 'I think my ribs are cracked.', 'It hurts to breathe!'],
  brokenSpine: ["My back! I can't feel my legs!", "I can't move my legs!", 'My legs... they won\'t work!'],
  brokenSkull: ['My head... something cracked...', 'Everything is spinning...', "I think my skull's broken."],
  brokenPelvis: ['My hip! I can\'t get up!', 'My hips... I can\'t stand!'],
  paralysed: ["I can't feel my body!", "I can't move!", 'Help... I can\'t move anything!', 'Somebody... I can\'t feel my arms...'],
  dying: ['Ugh...', 'Tell them... I...', 'So... cold...', 'Goodbye...', "I'm... so tired...", 'Is it getting dark?'],

  /* ---------------------------------- fighting -------------------------------- */
  betrayed: ['{other}?! Why?!', 'Hey! I thought we were friends!', 'What was that for, {other}?!', 'Et tu, {other}?'],
  angryAt: ["You'll pay for that!", 'Come here!', "That's it, {other}!", 'You want a fight?!', 'Big mistake, {other}.', "You're going to regret that!"],
  fightStart: ['Come on!', "Let's go!", 'Put your fists up!', "You're going down, {other}!", 'Bring it!', 'Square up, {other}!', 'Right. You and me.'],
  taunt: ['Is that all?', 'Come on!', 'Too slow!', 'Get up!', 'Had enough?', 'Stay down!', 'My nan hits harder.', "Who's next?"],
  fear: ['Help!', 'Stay away!', 'Please, stop!', "I don't want to die!", 'Get away from me!', 'Somebody help!', 'Leave me alone!'],
  flee: ['Run!', 'Nope! Nope!', "I'm out of here!", 'AAAH!', 'Help!', 'Every stickman for himself!', 'Not today!'],
  beg: ['Please! Stop!', 'I give up!', "Don't hurt me!", 'Mercy!', 'Okay, okay! You win!', 'I yield! I yield!'],
  spare: ['Fine. Get lost.', 'Stay down, then.', "That's enough.", 'Hmph. Pathetic.', 'Lucky for you I\'m nice.'],
  witnessHit: ['Whoa!', 'Hey! Stop that!', 'Ouch...', 'Oh no!', 'Yikes!', 'That looked painful.', 'Ooh!'],
  defendFriend: ['Leave {victim} alone!', 'Hey! Back off from {victim}!', 'Get away from {victim}!', 'Nobody touches {victim}!'],
  cheerFriend: ['Get them, {other}!', 'Go, {other}!', 'Yeah! Hit them!', 'Show them, {other}!', 'Left hook! Left hook!'],
  stopFight: ['Stop it, both of you!', 'Hey! Break it up!', 'Enough!', 'Why is everyone always fighting?'],
  victory: ['Ha!', 'Yeah!', 'Too easy!', 'And stay down!', "Who's the boss now?", 'Undefeated!', 'Did you see that?!'],
  surrender: ["Okay! Okay! Don't stab me!", 'Easy... easy...', "I don't want any trouble!", 'Put the knife down, {other}. Please.'],
  mock: ['Ha! Look at {victim}!', 'Hahaha! Down you go!', 'Nice fall, {victim}!', 'Timber!'],

  /* ---------------------------------- weapons --------------------------------- */
  weaponGet: ['Ooh, brass knuckles.', 'These will do.', "Now we're talking.", 'Nobody messes with me now.', 'Shiny. And heavy.'],
  weaponSee: ['Brass knuckles!', 'Ooh, shiny.', "What's that?", 'Somebody dropped their knuckles.'],
  weaponFear: ['Uh oh. {other} has knuckles.', 'Whoa, put those away!', 'Easy there, {other}...'],
  knifeGet: ['A knife. Now this is serious.', 'Sharp.', 'Nobody come any closer.', "I'll hold onto this.", 'Careful. It\'s pointy.'],
  knifeSee: ['Is that a knife?!', 'Who leaves a knife lying around?', 'Ooh. Sharp.', 'A knife... I don\'t like that.'],
  knifeFear: ['{other} has a KNIFE!', 'Put the knife down, {other}!', 'Whoa, whoa! Knife!', 'Everybody, {other} has a knife!', "Don't come near me with that!"],
  stabbed: ["I've been stabbed!", "There's a knife in me!", 'AAAH! It went in!', "{other} stabbed me!", "I'm bleeding!"],
  cut: ['It cut me!', 'Ow! That\'s sharp!', "I'm bleeding!", 'My skin!'],
  sawStab: ['{other} stabbed {victim}!', 'Oh my god, a knife!', 'Somebody stop {other}!', 'NO! {victim}!'],
  knifeStuckSee: ["There's a knife in {victim}!", '{victim}! Don\'t move!', 'Oh no, {victim}...', 'Is that... in you?!'],
  pullOut: ['Get it out, get it out!', 'Okay... on three...', 'This is going to hurt.', 'Hnnnngh!'],
  pullKnifeHelp: ['Hold still, {other}.', "I'm going to pull it out.", 'Deep breath, {other}.', 'Press here. Hard.'],
  throwKnife: ["You won't get away, {other}!", 'Catch this!', 'Heads up!'],

  /* ---------------------------------- machete --------------------------------- */
  macheteGet: ['A machete. Right.', 'This could clear a jungle.', 'Everybody back up.', 'Now THIS is a blade.', 'Heavy. Good.', 'Nobody move.'],
  macheteFear: ['{other} has a MACHETE!', 'Machete! Machete!', 'Put that thing down, {other}!', "That's not for people, {other}!", 'Run! {other} has a machete!', 'Easy with that, {other}...'],
  chopped: ['AAARGH! The machete!', '{other} chopped me!', "I'm cut! I'm cut open!", 'AAAH! It went right in!', 'Stop swinging that thing!'],
  sawChop: ['{other} just hacked at {victim}!', 'Oh god, the machete!', 'Somebody stop {other}!', '{victim}! Get away from them!'],

  /* ----------------------------------- guns ----------------------------------- */
  gunGet: ["A gun. Let's see them try something now.", 'Fifteen in the magazine.', 'This changes things.', 'Nobody move.', 'Heavier than it looks.', "I'm not afraid to use this."],
  gunFear: ['{other} has a GUN!', 'Gun! Gun! Everyone down!', 'Put the gun down, {other}!', 'Whoa, whoa, whoa! Easy with that!', "Is that loaded?!", "Don't point that at me!"],
  aimAt: ["Don't move, {other}!", 'Hands where I can see them!', 'One more step, {other}. I dare you.', "Stay right there!", "I'll shoot, {other}! I will!", 'On your knees!'],
  shootStart: ['Say goodbye, {other}!', 'You asked for this!', 'This ends now!', 'Eat lead, {other}!', 'Nobody does that to me!'],
  backDown: ["That's what I thought.", "Don't let me see you again.", 'Smart choice.', 'Keep those hands up.', 'Not worth it.'],
  reload: ['Reloading!', 'Changing mags!', 'Cover me!', 'Hold on... hold on...'],
  outOfAmmo: ['Click? No!', "I'm out!", 'Empty!', 'Come on, come on...'],
  outOfAmmoSee: ["{other}'s out! Get them!", "They're empty!", 'Now! While they reload!'],
  surrenderGun: ["Don't shoot!", "Okay, okay! Don't shoot!", "I'm not moving! I'm not moving!", 'Please, {other}! Put it down!', "I'm unarmed!", 'Easy! Easy!'],
  relief: ['Phew...', 'Okay. Okay.', 'I thought I was dead.', 'My heart...'],
  gunshots: ['GUNSHOTS!', 'Was that a gun?!', 'Everybody get down!', 'What was that?!', 'Somebody is shooting!', 'Shots fired!'],
  sawShooting: ['{other} is shooting at {victim}!', '{other} has a gun!', 'Stop shooting, {other}!', 'Get down, {victim}!'],
  takeCover: ['Take cover!', 'Get behind something!', 'Down! Down!', "{other}'s shooting!", 'Everyone get down!'],
  nearMiss: ['That was close!', 'Whoa! That nearly got me!', 'I felt that one go past!', 'Missed me!', 'Too close!'],
  shot: ["I'm hit!", "I've been shot!", 'AAAH! {other} shot me!', 'It burns!', "I'm shot! I'm shot!", 'Medic!'],
  sawShot: ['{other} shot {victim}!', '{victim}! No!', "They shot {victim}!", "{victim}'s hit!", 'Somebody help {victim}!'],

  /* ------------------------------- wounds, gore ------------------------------- */
  severedSelf: ['MY {part}! MY {part}!', "WHERE'S MY {part}?!", "It's gone! My {part}'s gone!", 'AAAAAH! My {part}!', "I can't feel my... where's my {part}?!", "That's MY {part} on the floor!"],
  sawSevered: ["{victim}'s arm! Oh god!", 'That came OFF!', 'Oh god, oh god, oh god...', "{victim}! You're missing a bit!", "That's... not supposed to come off.", 'I think I am going to be sick.'],
  limbSee: ["Is that... a hand?", "Whose is that?", "That's {victim}'s!", 'Is that a LEG?!', "Somebody's lost something.", 'I am not touching that.'],
  retch: ['Hurk...', "I'm gonna be sick...", 'Bleurgh.', 'Oh no. Oh no no.', '*gag*'],
  faint: ['I feel... faint...', 'Oh... the room is spinning...', 'I need to sit... down...', "That's... a lot of blood..."],
  sawFaint: ['{victim} fainted!', 'Whoa, {victim}! Wake up!', 'Somebody catch {victim}!'],
  shock: ["It's fine... it's fine... it's not fine.", "I can't feel it...", 'Why is everything so quiet?', "I'm cold...", 'Is this real?'],
  seeBlood: ["I'm bleeding!", "That's a lot of blood...", "It's coming out!", 'Oh no, oh no, look at it.', 'That is MY blood.'],
  checkWound: ['Ow. Let me see...', "It's just a scratch.", 'Hm. Not too bad.', 'That will leave a mark.'],
  dislocatedSelf: ['My {part}! It popped out!', "My {part}'s gone the wrong way!", "AAH! My {part}'s out of its socket!", "I can't move my {part}!"],
  popBack: ['Hold still... this will hurt.', 'On three. One-', 'Deep breath, {other}.', 'Trust me, {other}.', 'I saw this in a film once.'],
  relocated: ['AAARGH! ...oh. Oh, that is better.', 'You could have counted to three!', 'Thanks, {other}... I think.', 'It went back in!'],
  tourniquet: ['Hold still, I need to tie this off.', 'Press here. Hard!', "Stay with me, {other}! You're losing blood!", 'This is going to be tight.', "I've got you, {other}. I've got you."],
  tourniquetThanks: ['Thank you... {other}...', 'You saved my life, {other}.', "I owe you. I really owe you.", "It's stopped... it's stopped."],
  lostTooth: ['My tooth!', 'Hey! I need that tooth!', 'Ith my tooth on the floor?', 'You knocked my tooth out!'],

  /* ----------------------------- remembering ---------------------------------- */
  recallHurt: ['You! You hit me!', 'I remember you, {other}.', "I haven't forgotten, {other}.", 'You again.', "It's {other}. Keep away from me.", 'Back for more, {other}?'],
  recallShot: ["You shot me, {other}!", 'YOU! With the gun!', "I know you, {other}. You shot at me.", 'Stay away from me, {other}!'],
  recallKill: ['You killed {victim}!', "I saw what you did to {victim}.", 'Murderer!', "{victim}'s blood is on your hands, {other}."],
  recallHelp: ['{other}! Thanks again for before.', 'My hero, {other}!', "{other}! I never thanked you properly.", 'There\'s the one who saved me!'],
  recallFriend: ['{other}! Good to see you again.', 'Hey, {other}! Remember me?', 'There you are, {other}!'],
  heardOf: ["So you're {other}. I've heard about you.", "You're the one they told me about.", "{other}... I've heard things."],
  gossipBad: ['Did you hear? {victim} {what}!', 'Watch out for {victim}. They {what}.', "Can you believe it? {victim} {what}.", 'Keep away from {victim}. {victim} {what}.', "I'm telling you, {victim} {what}."],
  gossipGood: ["You know {victim}? They {what}. Good sort.", '{victim} {what}. Nice, right?', "If you're ever in trouble, find {victim}. They {what}."],
  gossipReplyBad: ['No way!', "I'll keep an eye on them.", 'Really?! That is awful.', "I'm staying away from them, then.", 'I knew there was something off about them.'],
  gossipReplyGood: ['Good to know.', 'Aw, that is nice.', "I'll remember that.", 'Really? Huh.'],
  remindGood: ['Remember when you {what}? Thanks for that.', "I still haven't forgotten. You {what}.", "You know, you {what}. That meant a lot."],
  remindBad: ["I haven't forgotten. You {what}.", 'Just so you know, I remember. You {what}.', 'Funny how you act like you never {what}.'],
  enemySee: ['{other}. My enemy.', 'Not you again.', 'Ugh. {other}.', "Well, if it isn't {other}.", 'Stay on your side, {other}.', 'I will never forgive you, {other}.'],

  /* ----------------------------- told what to do ------------------------------ */
  orderedFight: ['You heard them, {other}. Come here!', "Nothing personal, {other}.", "It's you and me, {other}!", "Let's do this, {other}!", "I'm coming for you, {other}!"],
  orderedFightFriend: ["Sorry, {other}... I have to.", "Don't take this personally, {other}!", 'I really, really don\'t want to do this.', "Friends or not, {other}... here I come."],

  /* ---------------------------------- crates ---------------------------------- */
  crate: ['Nice crate.', "What's in here?", 'Knock knock.', 'Solid wood.', 'A crate! Neat.', 'Empty, I think.', 'Good crate. Good crate.'],
  crateTop: ['King of the crate!', 'I can see everything from up here!', 'Woo!', 'Look at me!', 'Higher! Higher!'],
  jumpOff: ['Wheee!', 'Geronimo!', 'Woo!', 'Cannonball!'],
  crateHit: ['Who threw that?!', 'Where did that come from?!', 'OW! A crate?!', 'What was THAT?!', 'Raining crates now?!'],
  blame: ['{other}! Did you throw that?!', 'Was that you, {other}?!', 'Very funny, {other}!', 'I saw that, {other}!'],
  throwCrate: ['Catch!', 'Heads up, {other}!', 'Eat crate!', 'Special delivery!'],
  pinned: ['Get it off me!', "I can't move!", "Help! I'm stuck!", 'Heavy... so heavy...', 'Somebody lift this!'],

  /* ------------------------------- bodies flying ------------------------------- */
  bodyHit: ['Watch it!', 'Hey! Get off me!', 'Ow! Where did you come from?!', 'Look where you are flying!', 'Incoming!'],
  sorry: ['Sorry!', "It wasn't me!", 'Oof, sorry!', "I didn't mean to!"],
  grabbed: ['Whoa! Put me down!', 'AAAH!', "I'm flying!", 'Help!', 'What is happening?!', 'Let go of me!', 'Who turned gravity off?!', 'Not the hand!'],
  grabbedAgain: ['Not again!', 'Why me?!', 'PUT ME DOWN!', 'This again?!', 'I hate this part!'],
  thrownLand: ['Ugh...', "I'm alive?!", 'Who keeps doing that?!', 'Ow... everything hurts.', 'That is going to bruise.', 'I think I bounced.'],
  seeGrabbed: ['{victim} is flying!', 'What the...?!', 'Put {victim} down!', 'How?!', 'The hand! The hand is back!'],
  seized: ['LET GO OF ME!', "{other}! Let go!", "I can't breathe!", 'Put me down! PUT ME DOWN!', 'Somebody help me!', 'No no no no!'],
  seeSeized: ['{other} has got {victim}!', 'Let {victim} go!', '{victim}!', 'It picked {victim} up!', 'Somebody help {victim}!'],
  lookUp: ['Is someone up there?', 'Hello? Up there?', 'I swear something moved.', 'The sky has hands now?'],

  /* ---------------------------------- helping --------------------------------- */
  witnessDeath: ['NO!', '{victim}?! {victim}!', 'Oh my god...', "{victim} isn't moving!", 'They killed {victim}!', 'Is... is {victim} dead?'],
  witnessDeathStranger: ['Oh no...', 'Is that one... dead?', 'Whoa...', 'Oh god.', 'Somebody call someone!'],
  grief: ['Why... {victim}...', 'Wake up, {victim}...', "I'm so sorry, {victim}.", '{victim}... no...', "It's not fair...", 'You were the best, {victim}.'],
  avenge: ['This is for {victim}!', 'You killed {victim}!', "You'll pay for {victim}!"],
  killedGuilt: ["I... I didn't mean to...", 'What have I done?', '{victim}? Get up... please.', 'Oh no. No no no.'],
  killedProud: ["That's what you get.", 'Stay down.', "Who's next?", 'Hmph.'],
  killedAccident: [
    "{victim}?! No - that wasn't for you!", "I didn't see you there! I didn't see you!", 'Oh god. Oh god, {victim}.',
    'It was an accident! I swear it was an accident!', 'What have I done... {victim}...', 'No no no, not {victim}!',
  ],
  rushGun: ['Drop it!', 'Not if I get there first!', 'Get that thing away from me!', "You won't get the chance!", 'Charge!', 'Rush them!'],
  comfort: ['Are you okay?', 'Hang in there, {other}!', 'Let me help you up.', "You'll be alright.", "I've got you.", 'Stay with me, {other}!'],
  thanks: ['Thanks, {other}.', 'Thank you...', "You're a real friend, {other}.", 'I owe you one.'],
  crawl: ['Help... me...', "My legs... I can't stand...", 'Somebody...', 'Just... a bit further...'],

  /* ---------------------------------- the rest -------------------------------- */
  dodge: ['Whoa!', 'Close one!', 'Missed!', 'Hey!', 'Ha! Too slow!'],
  bored: ['Hmm.', 'La la la...', 'What to do...', 'Hmm hm hm.', '*yawn*', 'Is anything going to happen?', 'Bored, bored, bored.'],
  happy: ['What a day!', 'Life is good.', 'Hee hee.', 'I feel great!', 'Best day ever.'],
  investigate: ['What was that?', 'Hello?', "Who's there?", 'Huh?', 'Did something fall over?'],
  sawVanish: ['Where did {victim} go?!', '{victim}?! Gone?!', 'They just... vanished.', 'Poof. Gone.'],
  newcomer: ['Where did you come from?', 'Oh! Hello.', 'Whoa, a new one.', 'Hey, a new face!', 'Did you just... appear?'],
  wake: ['Ugh... what happened?', 'Where am I?', 'My head...', 'Who turned the lights off?', 'Did anyone get the number of that crate?'],
  getUp: ['Okay. Okay.', 'Ugh.', "I'm fine. I'm fine.", 'Nothing to see here.', 'Meant to do that.'],
  scaredOfDead: ["There's a body...", "I don't like this.", 'Is that... dead?', 'Poor thing...'],
  mournStranger: ['Poor thing.', 'Rest in peace.', 'Who did this?'],
  healed: ['I feel... better?', "Whoa, it doesn't hurt anymore!", 'A miracle!', 'My bones! They\'re fixed!'],
  hide: ['Hide!', "They won't see me here.", 'Shh...', 'Crate, protect me.'],
  panic: ['AAAAAH!', "WE'RE ALL GONNA DIE!", 'AAH! AAH!', 'EVERYBODY PANIC!'],
  lookAround: ['Hm?', 'Huh.', 'Anyone there?'],
  rest: ['I need to sit down.', 'Ow... just a minute.', 'Phew.', 'Give me a second.'],
  exercise: ['Time to work out!', 'Gotta stay in shape.', 'Feel the burn!', 'One more set.'],
  exerciseCount: ['{n}!', '{n}...', '{n}! Easy!', 'And {n}!'],
  exerciseDone: ['Phew! Done.', 'That\'s enough for today.', 'Look at these muscles.', 'I am SO sweaty.'],

  /* ---------------------------------- breath ---------------------------------- */
  tired: [
    'Huff... huff...', 'I need... a second...', 'Out of... breath...', 'My lungs are on fire.', "I'm not as fit as I thought.",
    'Can we... take five?', 'Legs... like jelly...', 'Note to self: more cardio.', 'Why is fighting so TIRING?',
  ],
  catchBreath: ['Just... give me a minute.', 'Huff... phew...', 'Hold on... hold on.', 'Too... much... running.', 'Breathe in. Breathe out.', 'Nobody... move... for a sec.'],
  breathBack: ['Okay. I\'m good.', 'Phew. Better.', 'Right. Where was I?', 'Second wind!', 'Alright, I can feel my legs again.', 'Back in business.'],

  /* -------------------------------- off balance -------------------------------- */
  stumble: ['Whoa-!', 'Woah woah woah!', 'Wait-!', 'Uh oh-!', 'Whoops!', 'Hey-hey-hey!', 'Nonono-!'],
  caught: ['Phew! Still standing.', 'Nailed it.', 'I meant to do that.', 'Balance of a cat.', 'Ha! Not today, floor.', 'Steady... steady...'],
  sawFall: ['Ouch. {victim} went down.', 'Timber!', 'Oof. You okay, {victim}?', 'That looked like it hurt.', 'Down goes {victim}!'],
  mockFall: ['HA! Look at {victim}!', 'Gravity wins again, {victim}!', 'Did the floor jump up at you, {victim}?', 'Graceful, {victim}. Real graceful.', 'Walk much, {victim}?'],
  sawCaught: ['Nice save, {victim}!', 'Ooh, almost!', 'Good balance!', 'How are you still up, {victim}?'],

  /* --------------------------- holsters and pockets ---------------------------- */
  drawGun: ["Gun's out.", "Don't make me use this!", 'Back off!', 'Stay where you are!', "I'm not playing around.", 'Nobody move!'],
  drawTaser: ["Taser's out.", 'One more step and you get zapped.', "Back off or you'll get the buzz!", 'Want a little shock?'],
  drawWeapon: ["Oh, I've got a {what}.", 'Out comes the {what}.', 'You want some of this {what}?', 'Good thing I kept the {what}.'],
  putAway: ['Okay. Putting the {what} away.', "Don't think I'll need this now.", 'Back it goes.', 'Crisis over, I think.', 'Away you go, {what}.'],
  pocketed: ['The {what} goes in my pocket.', "I'll keep this {what} for later.", 'Pocketed.', 'Finders keepers.', 'In the pocket. Just in case.'],

  /* --------------------------------- vests, ammo ------------------------------- */
  vestOn: ['Safety first.', 'Bulletproof. Mostly.', 'How do I look? Tactical?', 'Snug fit.', 'Now I feel ready for anything.', 'Velcro: the sound of safety.'],
  vestSaved: [
    'OOF! The vest... the vest stopped it!', "That's going to bruise. But I'm alive!", 'Like being kicked by a horse!', 'Best purchase I ever made.',
    'I got SHOT! ...and I am fine?!', 'Owww. Thank you, vest.', 'Right in the chest! Still breathing!',
  ],
  sawVestStop: ['The vest stopped it!', "{victim}'s vest took that one!", 'Whoa. Bulletproof!', 'How is {victim} still standing?!'],
  ammoGot: ['{n} rounds. That\'ll do.', 'Topped up.', 'Locked and loaded.', 'Full mags.', 'Plenty more where those came from.'],
  ammoNone: ['Empty. Great.', 'Nothing I can use.', 'Who took all the ammo?', 'Not my calibre. Or just empty.'],

  /* --------------------------------- the taser -------------------------------- */
  taserFear: ['Whoa, is that a taser?', 'Keep that thing away from me!', "Don't you dare zap me, {other}!", 'I have a heart condition! Probably!', 'Is that thing on?'],
  taserGet: ['A taser! Zap zap.', 'Anybody tries anything, they get the buzz.', 'Shocking.', 'Five seconds of fun, right here.', 'Nobody touch me. I mean it.'],
  tased: ['AAAAGHHH!', 'GRRRKKK!', 'AAH-AH-AH-AH!', 'Nnnnngh!', 'WHAT IS HAPPENING TO MEEE!', 'GAAAH-STOP-STOP!', 'EEEEEEEE!'],
  tasedAfter: ['What... was that...', 'Everything... tingles...', 'Ow. Ow ow ow.', 'I can taste colours.', 'Never. Again.', 'My hair is standing up. I don\'t have hair.'],
  driveStunned: ['OW! That BURNS!', 'Gah! You zapped me!', 'Stop zapping me, {other}!', 'YEOW!', 'That is NOT funny, {other}!'],
  sawTased: ['{other} tased {victim}!', 'Ooh, that looked like it hurt.', '{victim} went stiff as a board!', 'Is {victim} okay?!', 'Zzzap. Poor {victim}.'],
  sawCopTase: ['They tased {victim}!', '{victim} went down like a plank.', 'Easy, officer!', 'Whoa. {victim} is not getting up for a bit.', 'Did {victim} deserve that?'],

  /* ---------------------------------- the law --------------------------------- */
  seeCop: ['Oh, a police officer.', 'Hello, officer.', 'Afternoon, {other}.', 'Nice hat.', 'The police are here. Good.', 'Evening, {other}.'],
  seeCopRelief: ['{other}! Thank goodness!', 'Officer! Over here!', 'Finally, the police!', 'Help! {other}, help!', 'You took your time, {other}!'],
  seeCopGuilty: ['Uh oh. Police.', 'Act natural...', 'Oh no. Not the cops.', 'Just... walk normally.', "I didn't see anything. I wasn't here.", 'Gulp.'],
  reportMe: ['{other}! {victim} {what}!', 'Officer, it was {victim}! They {what}!', '{victim} {what}! Arrest them!', '{other}! Do something! {victim} {what}!'],
  reportCrime: ['{other}! {victim} just {what}!', 'Officer! {victim} {what}! Over there!', 'You have to do something: {victim} {what}!', 'I saw it! {victim} {what}!'],
  copThanks: ["Thanks, {other}. I'll handle {victim}.", 'Got it. Stay here.', "Understood. I'm on it.", 'Good work. Leave {victim} to me.', 'Noted. Stand back, please.'],
  copSees: ['Hey! Police! {other}, stop right there!', 'I saw that, {other}!', "That's assault! You're done, {other}!", 'Police! Leave {victim} alone!', 'Oi! {other}! Stop!'],
  copShotsFired: ['Shots fired! Shots fired!', 'Everybody down!', 'Dispatch, shots fired! Requesting backup!', 'Weapon! Get down!', 'Shots fired! Moving in!', 'Get down! Stay down!'],
  copStop: ['Police! Stop right there!', "{other}! Police! Don't move!", 'Hey! Stop! Police!', 'Freeze!', 'Hold it right there, {other}!'],
  copGetDown: ['On the ground! Now!', 'Get down! Hands where I can see them!', 'Down, {other}! On your knees!', 'Hands on your head! Get down!'],
  copStayDown: ['Stay down!', "Don't move, {other}!", 'Stay on the ground!', "Don't even think about getting up."],
  copDrop: ['Drop the weapon!', 'Put it down, {other}! Now!', 'Drop it! Drop it!', 'Let go of the weapon, {other}!', 'Weapon on the floor! Now!'],
  copDropGun: ['DROP THE GUN!', 'Drop the weapon or I will shoot!', 'Gun down, {other}! NOW!', 'Put it down or I fire!', 'Last chance, {other}! Drop it!'],
  copTaserWarn: ['Taser! Taser!', "Stop or I'll tase you!", 'Last warning, {other}!', 'You will get tased!', 'Taser! Stand clear!'],
  copStopResisting: ['Stop resisting!', 'Stay down, {other}!', 'Quit fighting it!', "Don't make me do it again!"],
  copChase: ["Stop! Police!", "You can't outrun the radio, {other}!", 'Suspect on foot! In pursuit!', 'Get back here!', "Running just makes it worse, {other}!"],
  copCuffTased: ['Hands behind your back.', "Don't move. You're getting cuffed.", 'Easy... cuffs going on.', 'Relax. It is over.'],
  copCuffing: ["You're under arrest, {other}.", 'Hands behind your back.', "Don't make this harder than it is.", 'Slowly. Hands back.'],
  copArrest: [
    '{other}, you are under arrest.', 'You have the right to remain silent. Use it.', "That's it, you're coming with me.",
    "Anything you say can be used against you. So maybe don't.", 'Off to the cells with you.', 'You\'re nicked, {other}.',
  ],
  copRelease: ["Alright, {other}. You're free to go. Behave.", "Consider this a warning, {other}.", "Off you go. I don't want to see you again.", "Cuffs off. Don't make me regret it.", "Lesson learned? Good."],
  copRadioCustody: ['Dispatch, one in custody.', 'Suspect {other} in custody.', 'All units: scene is secure.', 'Dispatch, I need transport for one.'],
  copSuspectDown: ['Suspect down. Dispatch, I need medical.', '{other} is down. Get an ambulance.', 'Suspect down! Scene is clear.', 'Dispatch... suspect is down.'],
  copIdle: ['Unit twelve, all quiet.', 'Copy that, dispatch.', 'Ten-four.', 'Nothing to report.', 'Checking in. Grey sky, black ground, no trouble.', 'Dispatch, say again?'],
  comply: ["Okay! Okay! I give up!", "Don't shoot!", "I'm not resisting!", 'Alright, officer, alright!', "I'm down! I'm down!", 'You got me. I give up.'],
  cuffed: ['Ow! Not so tight!', 'This is so unfair.', 'I want my phone call!', 'Fine. FINE.', 'Is this really necessary?', 'You got the wrong stickman!'],
  cuffedTalk: [
    'I want a lawyer.', 'These are too tight.', "I didn't do anything!", 'This is a misunderstanding.', 'Can I at least scratch my nose?',
    'My nose itches. Of course it does.', 'Somebody call my mum.', "I'm innocent! Mostly.", 'How long do I have to sit here?',
  ],
  uncuffed: ['Free! I\'m free!', 'Finally. My wrists...', "Thanks. I'll... behave.", 'Sweet freedom!', "I'm never doing that again."],
  sawArrest: ['{other} cuffed {victim}.', "Huh. {victim}'s been arrested.", "That's {victim} in cuffs.", 'Busted.', 'Off you go, {victim}.'],
  sawArrestMine: ['{victim} got what was coming!', 'Thank you, {other}! Lock them up!', "Ha! Who's laughing now, {victim}?", "That's for what you did to me, {victim}."],
  sawArrestRelief: ['Good. One less troublemaker.', 'Finally. Somebody stopped {victim}.', 'Nice work, {other}.', 'Phew. We are safe now.', 'Justice!'],
  sawArrestFriend: ['{victim}! No!', "Let them go! They didn't mean it!", "Hang in there, {victim}. I'll get you a lawyer.", 'Not {victim}!', "{victim}'s not a bad person!"],

  /* ------------------------------- fire, ice, air ------------------------------ */
  onFire: [
    "I'M ON FIRE!", 'IT BURNS! IT BURNS!', 'PUT IT OUT! PUT IT OUT!', 'AAAAAH! FIRE!', "HELP ME! I'M BURNING!", 'Get it off! GET IT OFF!',
    'HOT HOT HOT HOT!', 'Water! Somebody get water!', 'AAAAAAAAH!', 'Why is there FIRE?!',
  ],
  stopDropRoll: ['Stop, drop and roll! Stop, drop and roll!', 'Roll! Roll!', 'On the ground! Roll!', 'Drop and roll, drop and roll...', 'Roll it out, roll it out!'],
  rollAdvice: [
    'Stop, drop and roll, {other}!', '{other}! Get on the floor and ROLL!', 'Roll, {other}! ROLL!', 'Drop! Drop and roll!', "Don't run, {other}! Roll!",
    "Running makes it worse! ROLL!",
  ],
  fireOut: ["It's out... it's out...", "Oh no. Oh no, it's out. Is it out?", "Is it out? Tell me it's out.", 'I can still smell it...', 'Thank you. Thank you...', 'My skin...'],
  fireOutRolled: ['It worked! It actually worked!', "I rolled it out! I'm alive!", 'Stop, drop and roll. Who knew.', "Out. It's out. Owww...", 'School was right about that one.'],
  putOutDone: ["It's out, {other}. You're okay.", "There. It's out.", "Got it! You're okay now, {other}.", "Breathe, {other}. It's over.", "Don't move, {other}. You're burned."],
  sawOnFire: [
    '{victim} is ON FIRE!', 'FIRE! {victim} is on fire!', 'Somebody help {victim}!', "{victim}! You're burning!", 'Oh no, {victim}!', 'Get water! Anybody!',
    "Don't touch {victim}, you'll catch!",
  ],
  sawBurningBody: ["{victim}'s body is burning...", 'Oh no... {victim}...', 'Is that... {victim}?', 'Somebody put {victim} out. Please.'],
  sawPutOut: ["Phew. {victim}'s out.", "The fire's out!", '{victim} made it!', 'Is {victim} okay?', "{victim}'s smoking, but alive."],
  sawBurnDeath: ['{victim} burned to death...', 'No... {victim}...', 'That smell... {victim}...', "We couldn't put {victim} out.", 'Not like that. Not like that.'],
  sawFrozen: [
    '{victim} is frozen solid!', "{victim}? Can you hear me? You're ice!", '{victim} turned into a statue!', 'Is {victim}... frozen?', '{victim} is covered in ice!',
    "Don't knock {victim} over! They'll break!",
  ],
  sawThaw: ['{victim} is thawing out!', 'The ice is melting off {victim}!', '{victim}! Hang in there!', "Look! {victim}'s dripping!"],
  sawThawDead: ["The ice is melting... {victim} isn't moving.", '{victim}... too late.', "{victim}'s not waking up."],
  sawIceSnap: ['A piece of {victim} just broke off!', 'It snapped off like an icicle!', '{victim} is breaking!', 'Careful! Bits of {victim} are coming off!'],
  sawShatter: ['{victim} SHATTERED!', "{victim}'s in pieces!", 'No! {victim}!', "It's... it's all over the floor...", 'Like glass. {victim} broke like glass.'],
  sawFreezeDeath: ['{victim} froze to death...', '{victim}... so cold...', 'We were too late for {victim}.', "{victim}'s gone. Frozen."],
  sawChokeDeath: ['{victim} stopped breathing!', "{victim} couldn't breathe...", 'No... {victim}!', "{victim}'s gone blue..."],
  sawHeatDeath: ['{victim} collapsed from the heat!', 'It was too hot for {victim}...', "{victim}'s burning up... and now..."],
  frozenFriend: ["{other}? You're like ice...", 'Stay with me, {other}. Somebody warm them up!', '{other} is so cold...', 'Can you hear me, {other}?', "Don't you dare die on me, {other}."],
  thawWake: ['So... c-cold...', 'Wh-what happened? Why am I wet?', 'I was frozen... I was FROZEN.', "I c-can't feel my fingers...", 'Everything... hurts...'],
  choking: ["Can't... breathe...", '*gurgle*', 'Let... go...', 'Air... please...', '*choking*', 'Hkk... hkk...'],
  gasp: ['*GASP*', 'Air! AIR!', '*cough* *cough*', 'I can breathe... I can breathe...', '*gasping*', 'Never... do that... again...'],
  suddenHot: ["Whoa, it's suddenly SO hot!", 'Is it me, or is it boiling in here?', "I'm sweating buckets!", 'Why am I so hot?!', 'Somebody turn the heat down!'],
  suddenCold: ["Brrr! Where did that come from?!", "It's f-freezing!", 'Why is it suddenly so cold?', 'My t-teeth are chattering!', 'Who opened a window? There are no windows!'],
  tooHot: ["I'm burning up...", 'So hot... I need water.', "I feel like I'm melting.", 'Is it hot, or is it me?', 'I need some shade. There is no shade.'],
  cold: ['B-b-brrr...', 'So c-cold...', "Can't st-stop shivering...", "I can't feel my t-toes.", 'Anybody got a coat?'],
  breathless: ["Can't... catch my breath...", '*wheeze*', 'I need air...', 'Hah... hah...'],
  adrenaline: ['My heart is pounding!', "My hands won't stop shaking.", 'I feel like I could lift a crate. Two crates.', "Whoa. Whoa. Everything's so fast.", "I can't feel a thing right now."],
};

/*
 * More to say in the old situations: added to what is already there, so the
 * lists above stay readable.
 */
const MORE = {
  greet: ['Evening.', 'Hey hey!', 'Look who it is!', 'Oh good, a friendly face.', 'Hello, stranger.'],
  smalltalk: [
    'Have you seen the officer around? Very shiny badge.', 'I keep a vest in the cupboard. Just in case.', 'I tried jogging once. Never again.',
    'Do you think the police ever get days off?', 'You can buy bullets by the box now. Whole boxes!', 'Did you know a taser shoots two little darts? Terrifying.',
    "I'm saving up for a holster. A nice leather one.", 'I tripped over nothing earlier. Nothing! Just air.', 'Ever tried running in a straight line for an hour?',
    'If you push me, I wobble. Everyone wobbles.', 'I keep my knife in my pocket. For sandwiches.',
  ],
  reply: ['Huh. Fair.', 'Wild.', 'I can see that.', 'Ha! Stop it.', 'You and me both.'],
  bored: ['I could do some laps.', 'Maybe I will practise my balance.', 'Is it lunch yet? Do we eat?', 'Pockets: checked. Twice.'],
  getUp: ['Up we get.', 'Still got it.', 'Ow. Fine.', "Floor's harder than it looks.", 'Who moved the ground?'],
  dodge: ['Not this time!', 'Woop!', 'Nope!'],
  happy: ['Not a scratch on me!', 'Feeling light on my feet today.'],
  fightStart: ['Come on then!', "Let's dance, {other}.", 'You asked for it, {other}!'],
  hurtSmall: ['Ngh.', 'Ouf.', "That'll leave a mark."],
  wake: ['Did I miss anything?', 'Five more minutes...'],
};
for (const [k, v] of Object.entries(MORE)) LINES[k] = [...(LINES[k] || []), ...v];

/** What people say about the things a mod adds: only ever needed once the mod is in. */
export const EXTRA_LINES = {};
export function addLines(table) { Object.assign(EXTRA_LINES, table); }

/**
 * Something to say for `kind`, with the blanks filled in. `own` is a set of
 * lines of the speaker's own (a mod's characters have them): used for most
 * things they say, and for everything nobody else ever says.
 */
export function line(kind, vars = {}, own = null) {
  let list = own && own[kind] && (!LINES[kind] || Math.random() < 0.8) ? own[kind] : LINES[kind] || EXTRA_LINES[kind];
  if (!list) return '';
  if (!Array.isArray(list)) list = list[vars.partKey] || Object.values(list)[0];
  let s = pick(list);
  for (const [k, v] of Object.entries(vars)) if (typeof v === 'string') s = s.split('{' + k + '}').join(v);
  return s.replace(/\{\w+\}/g, 'them');
}
