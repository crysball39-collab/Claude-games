/* =============================================================================
   What people say when nobody is writing their lines for them.

   Sorted by the situation that prompts them. {part} becomes the part of the
   body concerned, {weapon} what the stranger is holding, {first} the
   speaker's own name. A line in capitals, or ending in "!", is shouted.
   ========================================================================== */
import { pick, chance } from '../core/util.js';

export const LINES = {
  idle: ['Where does the time go.', 'I should have taken the bus.', 'My feet are killing me.', 'Did I lock the door?', 'Seventeen minutes late. Wonderful.',
    'This city never changes.', 'I could murder a sandwich.', 'Is it Thursday? Feels like a Thursday.', 'Forgot my umbrella again.', 'I need a holiday.',
    'Rent is due on Friday.', 'One more block.', 'Should really call my mother.', 'What was I going to buy? Bread. Bread.', 'These shoes were a mistake.',
    'Looks like rain.', 'Nobody tells you how much walking there is.', 'I am not going back to that dentist.', 'Left, then left again. I think.'],
  bored: ['So bored.', 'Come on, come on...', 'Nothing. Nothing at all.', 'I am falling asleep on my feet.', 'Somebody do something interesting.',
    'Is this it? Is this the day?', 'Dull, dull, dull.', 'I have counted every window on that building.', 'Hm.', 'Slowest afternoon of my life.',
    'I would take a small disaster right now.', 'If one more minute passes like this...'],
  phone: ['No signal. Of course.', 'Pick up, pick up...', 'Three new messages and none of them good.', 'Battery at four percent. Perfect.', 'Why does it never load here?',
    'I am outside. No, outside. OUTSIDE.', 'Hello? Yes, I am still holding.'],
  greet: ['Morning.', 'Hey.', 'Afternoon.', 'How is it going?', 'Hello there.', 'Alright?', 'Excuse me.', 'Hi.', 'Nice day for it.', 'After you.'],
  greetBack: ['Hey.', 'Morning.', 'Not bad, you?', 'Cannot complain.', 'Hello!', 'All good, thanks.', 'Yeah, hi.', 'Mm. Hello.'],
  chatA: ['Did you see the price of eggs?', 'They say rain later.', 'The bakery on the corner closed down.', 'Buses are a joke today.', 'You hear about the roadworks?',
    'My dog ate a sock this morning.', 'Same song stuck in my head all day.', 'They put the rent up again.', 'Is it me or is it colder than yesterday?',
    'I swear that building was not there last year.', 'You ever just forget why you left the house?', 'My knee says there is a storm coming.'],
  chatB: ['Tell me about it.', 'No! Really?', 'Typical.', 'That is this city for you.', 'I heard that too.', 'Could be worse.', 'Do not get me started.',
    'Ha. Sounds about right.', 'You are not wrong.', 'Every single time.', 'Well, what can you do.', 'I had no idea.'],
  playerNear: ['Can I help you?', 'You are standing a bit close, friend.', 'Do I know you?', 'Personal space, please.', 'What are you looking at?',
    'Are you following me?', 'Yes?', 'Is there a problem?', 'I am just walking here.'],
  bump: ['Hey! Watch it!', 'Oi! Look where you are going!', 'Excuse you!', 'What is your problem?', 'Easy!', 'Whoa, careful!', 'Rude.', 'Do you mind?!', 'Unbelievable.'],
  stumble: ['Whoa-', 'Wh-whoa!', 'I have got it, I have got it-', 'Not falling, not falling-', 'Oh no oh no-', 'Steady!'],
  trip: ['Oof!', 'Who leaves a... oh. Oh no.', 'My ankle!', 'Agh, what did I- oh God.'],
  startle: ['Jesus!', 'Gah!', 'Do not DO that!', 'What the-!', 'My heart!', 'Whoa!'],
  sawSpawn: ['Where did THAT come from?', 'That was not there a second ago.', 'Did that just... appear?', 'I need to lie down.', 'Am I losing my mind?', 'Okay. That is new.',
    'Out of thin air. Out of thin air!', 'Nobody else saw that? Nobody?', 'I am not drinking that coffee again.'],
  sawFist: ['Hey! Break it up!', 'They are fighting!', 'Somebody stop them!', 'Oh no, no, no...', 'Leave them alone!', 'Not again.', 'Is nobody going to do anything?',
    'Pack it in, the pair of you!', 'Hey! HEY!'],
  sawWeapon: ['He has got a {weapon}!', '{weapon}! Everybody get back!', 'Is that a {weapon}?!', 'Oh God, he is armed.', 'That is a {weapon}. That is a real {weapon}.',
    'Weapon! He has a weapon!', 'Nobody move. He has a {weapon}.', 'Why does he have a {weapon}?'],
  aimedAt: ['Please, please do not.', 'Do not shoot! Do not shoot!', 'I have a family!', 'Take whatever you want!', 'Okay, okay, okay-', 'I did not see anything, I swear.',
    'Not me. Please, not me.', 'My wallet is in my pocket. Take it.', 'I am nobody. I am nobody!', 'Please. I have a dog. He needs me.', 'Do not do this.'],
  surrender: ['My hands are up! They are up!', 'I am not moving!', 'Whatever you say!', 'I am cooperating, see?', 'Look, empty hands. Empty.', 'Just tell me what you want.'],
  gunshot: ['What was that?!', 'Was that a gunshot?', 'Get down!', 'Shots! Somebody is shooting!', 'Oh my God-', 'That was close. That was really close.',
    'Gunfire! GUNFIRE!', 'That was not a car backfiring.', 'Where is it coming from?!'],
  flee: ['Run! RUN!', 'Get away from me!', 'Help! Somebody help!', 'Move, move, move!', 'He is crazy!', 'Call the police!', 'Do not follow me!', 'Out of my way!',
    'I am not dying here!', 'Go, go, go!', 'Police! POLICE!', 'Not today. Not today!'],
  cower: ['Please please please...', 'Do not hurt me.', 'Make it stop.', 'Not like this.', 'I just want to go home.', 'I cannot look.', 'Go away, go away, go away...',
    'This is not happening.', 'Somebody. Anybody.'],
  sawAttack: ['He just attacked them!', 'Oh God, he hit them!', 'Did you see that?!', 'He is killing them!', 'Stop! STOP!', 'Somebody call an ambulance!', 'Monster!',
    'Leave them alone!', 'What is wrong with you?!', 'In broad daylight!'],
  sawShot: ['He shot them! He just shot them!', 'They have been shot!', 'He is shooting people!', 'Oh God. He actually fired.', 'Shooter! SHOOTER!'],
  sawDeath: ['They are dead. They are actually dead.', 'Oh God. Oh God.', 'He killed them.', 'No, no, no, no...', 'Do not look. Do not look.', 'That is a body. That is a dead body.',
    'I am going to be sick.', 'They were just walking. They were just WALKING.', 'Somebody cover them up.'],
  sawDismember: ['Their arm. Their ARM.', 'That is not real. That cannot be real.', 'I cannot unsee that.', 'It came clean off.', 'Sweet mercy.', 'There are pieces. There are PIECES.',
    'Oh God, the blood-', 'That is somebody\'s leg.', 'Do not look down.'],
  sawHeadless: ['Their head. Oh God, their head.', 'It is gone. The whole head.', 'I am not seeing this. I am not seeing this.', 'Nobody should ever see that.'],
  sawCorpse: ['Is that... a person?', 'Hello? Are you alright? ...Oh.', 'Someone is lying here. Someone call somebody.', 'Do not step in it.', 'Poor soul.',
    'How long have they been there?', 'They are not breathing.', 'We should not be here.'],
  sawBlood: ['Is that blood?', 'There is blood everywhere.', 'Watch your step.', 'That is a lot of blood.', 'Whose is all this?', 'Somebody has been hurt here.'],
  sawHurt: ['You are bleeding. You know you are bleeding?', 'Are you alright? You do not look alright.', 'Sit down before you fall down.', 'Someone help this person!',
    'Hey. Hey, stay with me.', 'That needs a hospital.'],
  sawCarHit: ['That car just hit them!', 'It did not even brake!', 'Hit and run! Hit and run!', 'Somebody get the plate!', 'They went right over the bonnet!', 'Oh, that sound.'],
  carNear: ['Watch where you are driving!', 'Are you blind?!', 'The crossing is RIGHT THERE!', 'Maniac!', 'You nearly killed me!', 'Slow DOWN!'],
  horn: ['Alright, alright, I am moving!', 'Keep your hair on!', 'I heard you the first time!', 'Yes, yes, the horn works.'],
  hitBlunt: ['Agh!', 'Ow!', 'Oof-', 'What the-!', 'Stop it!', 'Hey!', 'Ugh!', 'My {part}!', 'Get off me!', 'Nnf!'],
  hitVest: ['Hnngh- vest. The vest took it.', 'Agh! That hit the plate!', 'Oof- I am hit. I am okay. I am okay.', 'Ghh- that knocked the wind out of me.', 'Vest stopped it. God, that hurts.', 'I felt that. Still here.'],
  hitCut: ['AAGH!', 'He cut me!', 'I am cut, I am cut!', 'My {part}!', 'It burns!', 'Oh God, that is deep.', 'Aaah! Get it away!'],
  hitStab: ['Hhk-', 'He stabbed me.', 'Oh... oh no.', 'It went in. It went right in.', 'I have been stabbed!', 'Nn- my {part}-'],
  hitShot: ['I am hit!', 'He shot me!', 'AAAGH! My {part}!', 'I have been shot, I have been shot!', 'Oh God it hurts-', 'It went straight through.', 'Shot. I have been shot.'],
  hitUnseen: ['Who-?!', 'What hit me?!', 'Behind me-!', 'Where did that come from?', 'Who is there?!', 'I did not even see-'],
  hitCar: ['The car- the car hit me-', 'I did not see it coming.', 'Everything hurts.', 'Did it stop? Did the car stop?'],
  boneBreak: ['It is broken! It is broken!', 'I heard it snap.', 'I cannot move my {part}!', 'Do not touch it, do not touch it-', 'That is not supposed to bend there.',
    'Something cracked. Something cracked!'],
  lostLimb: ['My {part}. Where is my {part}?', 'It is gone. It is GONE.', 'That is mine. That is mine on the ground.', 'I cannot feel- where is it?',
    'Put it back, put it back, put it back-', 'No. No no no no no.', 'I can still feel the fingers. How can I still feel them?'],
  bleeding: ['I am bleeding. I am bleeding a lot.', 'There is so much blood.', 'It will not stop.', 'I need to press on it. Press on it.', 'That is all mine, is it not.',
    'Somebody get a towel. A shirt. Anything.', 'It is going everywhere.'],
  downPain: ['Help me...', 'Please... somebody...', 'It hurts. It hurts so much.', 'Do not leave me here.', 'I cannot get up.', 'Mum...', 'Just... give me a minute.',
    'Why. Why me.', 'Is anybody there?', 'Aaah... aaah...'],
  crawl: ['Got to... get away...', 'Keep moving. Keep moving.', 'Not far. Not far now.', 'Do not look back.', 'One arm in front of the other.', 'Nearly. Nearly.'],
  dying: ['I am so cold.', 'Everything is going quiet.', 'Tell my sister... tell her...', 'I cannot see properly.', 'So tired...', 'Is it getting dark?',
    'I do not want to go.', 'Not yet. Not yet.', 'It does not hurt any more.', 'Somebody hold my hand.', 'I never finished...'],
  cold: ['Why is it so cold?', 'I cannot stop shaking.', 'Is there a blanket?', 'My hands have gone numb.'],
  cantBreathe: ['Cannot... breathe...', '*gasping*', 'Air- I need air-', 'My chest-', 'It is like drowning.', 'Every breath... less...'],
  nausea: ['I am going to be sick.', 'Oh no. Stomach.', 'Hhrk-', 'Do not make me look at it.', 'The smell-', 'Everything is spinning.'],
  afterVomit: ['Sorry. Sorry.', 'Ugh. That is better. No it is not.', 'Do not look at me.', 'There goes breakfast.', 'I am fine. I am not fine.'],
  blind: ['I cannot see! I cannot see!', 'My eyes!', 'Everything is black-', 'Who is there? I cannot see you!', 'Tell me what is happening!'],
  deaf: ['My ears! I cannot hear anything!', 'Everything is ringing.', 'WHAT? I CANNOT HEAR YOU.', 'It is all just a whine.'],
  paralysed: ['I cannot feel my legs.', 'My legs will not move. Why will they not move?', 'Nothing below the waist. Nothing.', 'Somebody tell me my legs are still there.'],
  wake: ['Wh... what happened?', 'How long was I out?', 'My head...', 'Where am I?', 'Did I fall?', 'Ow. Ow ow ow.'],
  getUp: ['I am up. I am up.', 'Okay. Okay. Still alive.', 'Nothing broken. I think.', 'That is going to bruise.', 'Right. Where was I.'],
  fight: ['You want some?!', 'Come on then!', 'Pick on someone else!', 'I will put you on the floor!', 'Wrong person, pal!', 'That all you have got?',
    'I did not start this!', 'Back off!', 'Try that again!'],
  fightWin: ['Stay down.', 'And do not get up.', 'Had enough?', 'I warned you.', 'I did not want to do that.'],
  relief: ['Is it over?', 'I think he has gone.', 'I am okay. I am okay.', 'My hands will not stop shaking.', 'I need a drink.', 'I am never leaving the house again.',
    'Nobody is going to believe this.', 'Breathe. Just breathe.'],
  mourn: ['Hey. Hey, stay with me.', 'Help is coming. I think.', 'Can you hear me?', 'Do not close your eyes.', 'Somebody call an ambulance!', 'They are not moving.',
    'I am sorry. I am so sorry.', 'I do not know what to do. I do not know first aid.', 'Squeeze my hand if you can hear me.'],
  gawk: ['What is going on over there?', 'Is that a film shoot?', 'I cannot look away.', 'Should we... do something?', 'Somebody is filming this, right?',
    'This is not my business. This is not my business.', 'I am just going to stand here, then.'],
  crate: ['Who is throwing crates?!', 'Mind the box!', 'Where do these keep coming from?', 'That nearly took my head off!'],

  /* answers to things the stranger says */
  replyGreet: ['Hello.', 'Hi there.', 'Afternoon.', 'Hey. Do I know you?', 'Uh, hi.', 'Yeah, hello.'],
  replyHow: ['Not bad. Busy.', 'Fine, thanks. You?', 'Tired, honestly.', 'Been better, been worse.', 'Ask me after five o\'clock.', 'Fine. Why?'],
  replyName: ['{first}. Why do you ask?', 'I am {first}.', 'It is {first}. And you are?', '{first}. Not that it is any of your business.'],
  replyJob: ['I am a {job}.', '{job}. It pays the rent. Barely.', 'These days? {job}.'],
  replyWhere: ['I am {errand}.', 'Just {errand}.', 'Me? {errand}. Why?'],
  replyThreat: ['Okay! Okay! Whatever you want!', 'Please, I do not want any trouble.', 'Take it, just take it!', 'Do not hurt me!', 'I will do anything you say!'],
  replyThreatBrave: ['Or what?', 'You do not scare me.', 'Try it and see what happens.', 'Walk away. Now.', 'I have dealt with worse than you.'],
  replySorry: ['It is fine. It is fine.', 'Just be more careful.', 'Yeah, well. Alright.', 'Sorry does not fix it.', 'Okay. Apology accepted.', 'A bit late for sorry.'],
  replyInsult: ['Charming.', 'Same to you.', 'What did you just say to me?', 'Lovely. Really lovely.', 'Grow up.', 'I am not doing this today.'],
  replyHelpHurt: ['Yes. Yes, help me. Please.', 'Call an ambulance. Please.', 'Do not leave me.', 'I need a doctor.', 'Press here. Hard.'],
  replyHelpFine: ['I am fine, thanks.', 'No, I am alright.', 'Do I look like I need help?', 'Kind of you. No.'],
  replyGo: ['Gladly.', 'You do not have to tell me twice.', 'Going. I am going.', 'Fine by me.'],
  replyStay: ['I am not moving. See? Not moving.', 'Staying right here.', 'Okay. Okay. Standing still.'],
  replyQuestion: ['I do not know.', 'Why are you asking me?', 'No idea, sorry.', 'Could not tell you.', 'Ask somebody else.', 'What kind of a question is that?'],
  replyDefault: ['Sorry, I am in a hurry.', 'Uh-huh.', 'If you say so.', 'Right...', 'Okay then.', 'I do not have time for this.', 'Mm.', 'Sure. Sure.'],
  replyScared: ['Stay away from me!', 'Do not talk to me!', 'Get back!', 'Leave me alone, please!', 'I do not want to hear it!'],
  replyHurt: ['Does it LOOK like I can chat?', 'Not now. Not now.', 'I cannot... I cannot talk.', 'Just get help.'],
  replyDeaf: ['WHAT? My ears are ringing!', 'I cannot hear you!', 'Speak up! Everything is muffled!'],
  replyThanks: ['You are welcome.', 'No trouble.', 'Any time.', 'Do not mention it.'],
  replyYes: ['Good.', 'Right then.', 'Glad we agree.'],
  replyNo: ['Suit yourself.', 'Fine.', 'No? Okay.'],
};

/** How many lines there are in all, for the curious. */
export const LINE_COUNT = Object.values(LINES).reduce((n, a) => n + a.length, 0);

const _last = new Map();

/** A line for a situation, never the same one twice running. */
export function line(category, vars = {}) {
  const list = LINES[category];
  if (!list) return '';
  let text = pick(list);
  for (let i = 0; i < 4 && _last.get(category) === text && list.length > 1; i++) text = pick(list);
  _last.set(category, text);
  return text.replace(/\{(\w+)\}/g, (m, key) => (vars[key] != null ? vars[key] : key === 'weapon' ? 'weapon' : key === 'part' ? 'arm' : ''));
}

/** A person's own habits of speech, laid over a stock line now and then. */
export function flavour(text, persona, mood) {
  if (!text || !chance(0.22)) return text;
  const q = persona.quirk || '';
  if (q.includes('polite')) return chance(0.5) ? 'Sorry- ' + lower(text) : text.replace(/[.!]$/, '') + ', if you would not mind.';
  if (q.includes('swears') && mood !== 'calm') return pick(['Damn it. ', 'Bloody hell. ', 'For crying out loud. ']) + text;
  if (q.includes('prays')) return pick(['Lord help me. ', 'God have mercy. ', 'Please God. ']) + text;
  if (q.includes('dark jokes') && mood !== 'calm') return text + pick([' Great day for it.', ' Typical Tuesday.', ' Ten out of ten. Would not recommend.']);
  if (q.includes('filmed')) return text + pick([' Where is the camera?', ' This is a prank, right?']);
  if (q.includes('late')) return text + pick([' And I am going to be LATE.', ' I do not have time for this.']);
  if (q.includes('dog')) return mood === 'calm' ? text : text + pick([' Who is going to feed Biscuit?', ' I have to get home to the dog.']);
  if (q.includes('counts') && mood !== 'calm') return pick(['One. Two. Three. ', 'Four, five, six... ']) + text;
  if (q.includes('questions') && mood !== 'calm') return text + pick([' Why? Why is this happening?', ' What is going on? Who is doing this?']);
  return text;
}
function lower(t) { return t.charAt(0).toLowerCase() + t.slice(1); }

/** Is this something you would shout? */
export function isShout(text) { return /!|[A-Z]{4,}/.test(text); }

const KEYWORDS = [
  ['replyThreat', /\b(kill|shoot|stab|die|dead|hands up|freeze|don'?t move|give me|your money|wallet|hurt you|or else|get down|on the ground|i('?ll| will) cut)\b/i],
  ['replySorry', /\b(sorry|apolog|my bad|forgive|didn'?t mean)\b/i],
  ['replyInsult', /\b(idiot|stupid|ugly|moron|shut up|loser|fool|dumb|jerk|hate you|pathetic|coward)\b/i],
  ['replyHelp', /\b(help|ok\?|okay\?|alright\?|all right\?|are you (ok|hurt|alright)|ambulance|doctor|hospital|you('?re| are) bleeding|can i do)\b/i],
  ['replyGo', /\b(run|go away|leave|get out|get lost|scram|move along|go home|get away)\b/i],
  ['replyStay', /\b(stay|stop|wait|hold still|stand still|don'?t go)\b/i],
  ['replyName', /\b(your name|who are you|what are you called|what'?s your name)\b/i],
  ['replyJob', /\b(job|work|do for a living|what do you do)\b/i],
  ['replyWhere', /\b(where are you going|where you going|what are you doing|where are you headed|why are you here)\b/i],
  ['replyHow', /\b(how are you|how'?s it going|how are things|how do you feel|you good|what'?s up)\b/i],
  ['replyThanks', /\b(thanks|thank you|cheers|appreciate)\b/i],
  ['replyGreet', /\b(hi|hello|hey|good (morning|afternoon|evening)|greetings|yo|howdy)\b/i],
  ['replyYes', /^\s*(yes|yeah|yep|ok|okay|sure|right)\b/i],
  ['replyNo', /^\s*(no|nope|nah|never)\b/i],
];

/** Which stock answer something said to a person calls for. */
export function classify(text) {
  for (const [cat, re] of KEYWORDS) if (re.test(text)) return cat;
  return /\?\s*$/.test(text) ? 'replyQuestion' : 'replyDefault';
}
