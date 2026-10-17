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
};

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
