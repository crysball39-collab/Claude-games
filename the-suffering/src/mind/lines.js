/* =============================================================================
   What people say when nobody is writing their lines for them.

   Sorted by the situation that prompts them. {part} becomes the part of the
   body concerned, {weapon} what the stranger is holding, {desc} what somebody
   looks like, {first} the speaker's own name. A line in capitals, or ending in
   "!", is shouted.

   Written the way people actually talk, which under stress is not much like
   writing: short, broken off, repeated, sworn, and mostly about the body. A
   person who has just been shot usually does not say so in a sentence.
   ========================================================================== */
import { pick, chance } from '../core/util.js';

export const LINES = {
  /* ---------------------------- an ordinary day ---------------------------- */
  idle: ["Where'd the time go.", "Should've taken the bus.", "My feet are killing me.", "Did I lock the door? I think I locked the door.", "Seventeen minutes late. Great.",
    "I could really go for a sandwich.", "Is it Thursday? Feels like a Thursday.", "Forgot my umbrella. Again.", "I need a vacation.", "Rent's due Friday. Ugh.",
    "One more block.", "I should call my mom.", "What was I getting? Bread. Bread and... something.", "These shoes were a mistake.", "Looks like rain.",
    "Nobody tells you how much walking there is.", "Not going back to that dentist.", "Left, then left again. I think.", "Why is everything so expensive now.",
    "I'll do it tomorrow.", "Okay. Bank, then pharmacy, then home.", "I really need to sleep more.", "Was that today? Was that meeting today?"],
  bored: ["So bored.", "Come on, come on...", "Nothing. Nothing at all.", "I'm falling asleep standing up.", "Somebody do something.",
    "This is it? This is the day?", "Ugh.", "I've counted every window on that building.", "Hm.", "Slowest afternoon of my life.",
    "Honestly I'd take a small disaster right now.", "If one more minute goes by like this..."],
  phone: ["No signal. Of course.", "Pick up, pick up...", "Three new messages and they're all bad.", "Four percent. Perfect.", "Why won't it load.",
    "I'm outside. No, OUTSIDE.", "Yeah, I'm still on hold.", "Ha. Okay, that's funny.", "Who even is this?"],
  greet: ["Morning.", "Hey.", "Hi.", "How's it going?", "Hey there.", "'Scuse me.", "Afternoon.", "Nice day, huh.", "After you."],
  greetBack: ["Hey.", "Morning.", "Not bad, you?", "Can't complain.", "Hi!", "Good, thanks.", "Yeah, hi.", "Mm. Hey."],
  chatA: ["You see what eggs cost now?", "Supposed to rain later.", "The bakery on the corner closed.", "Buses are a joke today.", "You hear about the roadwork?",
    "My dog ate a sock this morning.", "Had the same song stuck in my head all day.", "They raised the rent again.", "Is it me or is it colder than yesterday?",
    "I swear that building wasn't there last year.", "You ever forget why you left the house?", "My knee says there's a storm coming."],
  chatB: ["Tell me about it.", "No way. Really?", "Typical.", "That's this city for you.", "Yeah, I heard.", "Could be worse.", "Don't get me started.",
    "Ha. Sounds about right.", "You're not wrong.", "Every single time.", "Well, what can you do.", "Huh. Didn't know that."],
  playerNear: ["Can I help you?", "You're kind of close, man.", "Do I know you?", "Personal space?", "What are you looking at?",
    "Are you following me?", "Yeah?", "Is there a problem?", "I'm just walking here."],
  bump: ["Hey! Watch it!", "Look where you're going!", "Excuse you!", "What's your problem?", "Easy!", "Whoa, careful!", "Rude.", "Seriously?!", "Unbelievable."],
  stumble: ["Whoa-", "Wh- whoa!", "I got it, I got it-", "No no no-", "Oh shit-", "Hey!"],
  trip: ["Oof!", "Who leaves a- oh. Oh no.", "Ow, my ankle!", "Agh- what did I- oh God."],
  startle: ["Jesus!", "Shit!", "Don't DO that!", "What the-!", "Oh my God!", "Whoa!"],
  sawSpawn: ["Where did THAT come from?", "That wasn't there a second ago.", "Did that just... appear?", "Okay. I need to sit down.", "Am I losing my mind?", "Okay. That's new.",
    "Out of nowhere. Out of NOWHERE.", "Nobody else saw that?", "I'm done with coffee."],

  /* ------------------------------ seeing trouble ------------------------------ */
  sawFist: ["Hey! Break it up!", "They're fighting!", "Somebody stop them!", "Oh no, no, no...", "Leave them alone!", "Not again.", "Is nobody gonna do anything?",
    "Knock it off!", "Hey! HEY!", "Jesus, stop!"],
  sawWeapon: ["He's got a {weapon}!", "{weapon}! Everybody back!", "Is that a {weapon}?!", "Oh God, he's got a {weapon}.", "That's a real {weapon}. That's real.",
    "He's armed! He's armed!", "Nobody move. He's got a {weapon}.", "Why does he have a {weapon}?"],
  aimedAt: ["Please. Please don't.", "Don't shoot! Don't shoot!", "I have kids!", "Take whatever you want!", "Okay, okay, okay-", "I didn't see anything, I swear.",
    "Not me. Please, not me.", "My wallet's in my pocket. Take it.", "I'm nobody! I'm nobody!", "Please, man. Please.", "Don't do this. Don't."],
  surrender: ["My hands are up! They're up!", "I'm not moving!", "Whatever you want!", "I'm not doing anything, see?", "Look, empty. Empty hands.", "Just tell me what you want."],
  gunshot: ["What was that?!", "Was that a gunshot?", "Get down!", "Shots! Somebody's shooting!", "Oh my God-", "That was close. That was so close.",
    "GUNSHOTS!", "That wasn't a car.", "Where's it coming from?!", "Get down, get DOWN!"],
  flee: ["Run! RUN!", "Get away from me!", "Help! Somebody help!", "Go, go, go!", "He's crazy!", "Somebody call 911!", "Don't follow me!", "Move! MOVE!",
    "I'm not dying here!", "Oh God oh God oh God-", "POLICE! Somebody get the police!", "Not today. Not today!"],
  cower: ["Please please please...", "Don't hurt me.", "Make it stop.", "Not like this.", "I just want to go home.", "I can't look.", "Go away go away go away...",
    "This isn't happening.", "Somebody. Anybody.", "Oh God, please."],
  sawAttack: ["He just attacked somebody!", "Oh my God, he hit them!", "Did you see that?!", "He's gonna kill them!", "Stop! STOP!", "Somebody call an ambulance!", "What the fuck!",
    "Leave them alone!", "What is wrong with you?!", "In broad daylight!"],
  sawShot: ["He shot somebody! He just shot somebody!", "Somebody's been shot!", "He's shooting people!", "Oh God. He actually shot them.", "Shooter! SHOOTER!", "Oh fuck, oh fuck-"],
  sawDeath: ["They're dead. They're actually dead.", "Oh God. Oh God.", "He killed them.", "No, no, no, no...", "Don't look. Don't look.", "That's a body. That's a dead body.",
    "I'm gonna be sick.", "They were just walking. They were just WALKING.", "Somebody cover them up."],
  sawDismember: ["Their arm. Their ARM.", "That's not real. That can't be real.", "I can't unsee that.", "It came right off.", "Oh my God.", "There's pieces. There's PIECES.",
    "Oh God, the blood-", "That's somebody's leg.", "Don't look down."],
  sawHeadless: ["Their head. Oh God, their head.", "It's gone. The whole head.", "I'm not seeing this. I'm not seeing this.", "Nobody should ever see that."],
  sawCorpse: ["Is that... a person?", "Hey. Hey, you okay? ...Oh.", "There's somebody lying here. Somebody call someone.", "Don't step in it.", "Oh, man.",
    "How long have they been here?", "They're not breathing.", "We shouldn't be here."],
  sawBlood: ["Is that blood?", "There's blood everywhere.", "Watch your step.", "That's a lot of blood.", "Whose is all this?", "Somebody got hurt here."],
  sawHurt: ["You're bleeding. You know you're bleeding?", "Are you okay? You don't look okay.", "Sit down before you fall down.", "Somebody help!",
    "Hey. Hey, stay with me.", "You need a hospital."],
  sawCarHit: ["That car just hit somebody!", "It didn't even brake!", "Hit and run! Hit and run!", "Somebody get the plate!", "They went right over the hood!", "Oh, that sound."],
  carNear: ["Watch where you're driving!", "Are you blind?!", "That's a CROSSWALK!", "Maniac!", "You almost killed me!", "Slow DOWN!"],
  horn: ["Okay, okay, I'm going!", "Relax!", "I heard you the first time!", "Yeah, yeah, the horn works."],
  crate: ["Who's throwing crates?!", "Watch the box!", "Where do these keep coming from?", "That almost took my head off!"],

  /* --------------------------------- getting hurt ------------------------------ */
  hitBlunt: ["Agh!", "Ow!", "Oof-", "What the-!", "Stop!", "Hey!", "Ugh-", "Fuck!", "Ow, my {part}!", "Get off me!", "Nnh-", "Okay, okay!"],
  hitCut: ["AAH!", "He cut me!", "I'm cut, I'm cut!", "Oh fuck, my {part}-", "It burns, it burns!", "Oh God, that's deep.", "Get it away from me!", "Aaagh- what did you DO-"],
  // a knife going in often feels like a punch until the blood shows
  hitStab: ["Hk-", "He- he punched me- oh God, that's blood.", "Oh... oh no.", "It went in. It went in.", "I'm stabbed! I'm stabbed!", "Nn- my {part}-",
    "Wait- what- oh fuck.", "Ah- ahh-"],
  // and a bullet often isn't understood at all for a second
  hitShot: ["AAAH!", "What- what was- ah, fuck!", "I'm hit! I'm hit!", "He shot me! He fucking shot me!", "Oh God it burns-", "Ahh, my {part}! My {part}!",
    "I've been shot. I've been- oh God.", "Something hit me- I'm bleeding-", "AAGH- FUCK-"],
  hitUnseen: ["Who-?!", "What hit me?!", "Behind me-!", "Where'd that come from?", "Who's there?!", "I didn't even see-", "What the fuck was that?!"],
  hitCar: ["The car- the car-", "I didn't see it.", "Everything hurts.", "Did it stop? Did it stop?", "Oh God, my legs-", "Uhhh..."],
  hitVest: ["Hnngh- the vest. The vest got it.", "Agh! Plate! It hit the plate!", "Oof- I'm hit, I'm okay, I'm okay.", "Ghh- can't breathe- knocked the wind out-",
    "Vest stopped it. Jesus, that hurts.", "I'm good. I'm good. Fuck."],
  hitHelmet: ["Agh- my head- the helmet-", "That rang my skull.", "Helmet. Thank God.", "Nngh- my ears are ringing.", "It hit the helmet. It hit the helmet!"],
  boneBreak: ["It's broken! It's broken!", "I felt it snap. I felt it.", "I can't move my {part}!", "Don't touch it, don't touch it-", "That's not supposed to bend like that.",
    "AAH- it cracked- something cracked-", "Oh God, I can feel it moving."],
  lostLimb: ["My {part}. Where's my {part}?", "It's gone. It's GONE.", "That's mine. That's mine on the ground.", "I can't- where is it-",
    "Put it back, put it back, put it back-", "No. No no no no no.", "I can still feel my fingers. How can I feel them?", "Oh God. Oh God oh God oh God."],
  bleeding: ["I'm bleeding. I'm bleeding a lot.", "There's so much blood.", "It won't stop. It won't stop.", "I gotta press on it. Press on it.", "Is that all mine?",
    "Somebody get a towel. A shirt. Anything.", "It's everywhere. It's all over me.", "Why won't it stop?"],
  downPain: ["Help me...", "Please... somebody...", "It hurts. It hurts so much.", "Don't leave me here.", "I can't get up.", "Mom...", "Just... gimme a second.",
    "Why. Why me.", "Is anybody there?", "Aaah... aaah...", "Fuck... fuck...", "Oh God... oh God...", "Somebody call... call somebody..."],
  crawl: ["Gotta... get away...", "Keep moving. Keep moving.", "Not far. Not far.", "Don't look back.", "Come on... come on...", "Almost. Almost."],
  // losing a lot of blood: cold, thirsty, scared, confused; voices go small
  faint: ["I don't feel good.", "Whoa... head's spinning.", "I need to sit down.", "Everything's going white.", "I think I'm gonna pass out.", "My hands are tingling."],
  dying: ["I'm so cold.", "It's getting quiet.", "Tell my sister... tell her...", "I can't see right.", "So tired...", "Is it getting dark?",
    "I don't wanna die.", "Not yet. Please, not yet.", "It doesn't hurt anymore.", "Somebody hold my hand.", "I'm so thirsty.", "Am I dying? Am I gonna die?", "Mom?"],
  cold: ["Why's it so cold?", "I can't stop shaking.", "Is there a blanket?", "My hands are numb."],
  injected: ["Ow! What- what was that?!", "Did you just stick me with something?!", "What did you put in me?!", "Ah! A needle- what the hell was that?!", "Get away from me! What was in that?!"],
  poisoned: ["Something's wrong. Something's really wrong.", "I feel... I feel wrong.", "My stomach- oh God-", "Everything's spinning... I can't feel my fingers.",
    "I think I've been poisoned. I need a hospital.", "Why am I sweating like this?", "I can't- my chest is tight-", "Somebody call an ambulance. Please."],
  winded: ["Hhh... hhh... gotta stop...", "Can't... run... anymore.", "Hold on... can't breathe...", "Ugh. I'm so out of shape.", "Wait. Wait. Just... give me a second."],
  cantBreathe: ["Can't... breathe...", "Hhh- hhh-", "Air- I need- air-", "My chest-", "It's like drowning.", "Every breath... less..."],
  nausea: ["I'm gonna throw up.", "Oh no. Stomach.", "Hhrk-", "Don't make me look at it.", "The smell-", "Everything's spinning."],
  afterVomit: ["Sorry. Sorry.", "Ugh. Better. No it's not.", "Don't look at me.", "There goes breakfast.", "I'm fine. I'm not fine."],
  blind: ["I can't see! I can't see!", "My eyes!", "Everything's black-", "Who's there? I can't see you!", "Tell me what's happening!"],
  deaf: ["My ears! I can't hear anything!", "Everything's ringing.", "WHAT? I CAN'T HEAR YOU.", "It's just this... whine."],
  paralysed: ["I can't feel my legs.", "My legs won't move. Why won't they move?", "Nothing below my waist. Nothing.", "Somebody tell me my legs are still there."],
  wake: ["Wh... what happened?", "How long was I out?", "My head...", "Where am I?", "Did I fall?", "Ow. Ow ow ow."],
  getUp: ["I'm up. I'm up.", "Okay. Okay. Still here.", "Nothing broken. I think.", "That's gonna bruise.", "Okay. Where was I."],
  tased: ["Gnnnnnhhh-!", "Aaaaghhhh-!", "Hhhnnnggg-!", "Nnnnnnnn-!", "Ghhhhk-!", "Aaah-ah-ah-ah-!"],
  afterTase: ["What... what did you do to me...", "I can't... my legs...", "Everything hurts. Everything.", "Don't do that again. Please.", "I couldn't move. I couldn't move at all.",
    "My whole body just... locked."],

  /* ----------------------------- fighting, and after ---------------------------- */
  fight: ["You want some?!", "Come on then!", "Pick on someone else!", "I'll put you on the ground!", "Wrong guy, buddy!", "That all you got?",
    "I didn't start this!", "Back off!", "Try that again!", "Come on!"],
  fightWin: ["Stay down.", "Don't get up.", "Had enough?", "I warned you.", "I didn't want to do that."],
  relief: ["Is it over?", "I think he's gone.", "I'm okay. I'm okay.", "My hands won't stop shaking.", "I need a drink.", "I'm never leaving the house again.",
    "Nobody's gonna believe this.", "Breathe. Just breathe."],
  mourn: ["Hey. Hey, stay with me.", "Help's coming. I think.", "Can you hear me?", "Don't close your eyes.", "Somebody call an ambulance!", "They're not moving.",
    "I'm sorry. I'm so sorry.", "I don't know what to do. I don't know first aid.", "Squeeze my hand if you can hear me."],
  gawk: ["What's going on over there?", "Is that a movie or something?", "I can't look away.", "Should we... do something?", "Somebody's filming this, right?",
    "Not my business. Not my business.", "Okay, I'm just gonna stand here."],

  /* ---------------------------------- 911 ----------------------------------- */
  call911: ["Hi, yeah- I need the police.", "Yes, hi, I need police, and- and an ambulance.", "Hello? Yeah. Police, please.", "Hi. Um. I need to report something. Police.",
    "Yeah, 911? Okay. Okay.", "Hi- sorry- I don't know who to- police. I need the police."],
  callBody: ["There's somebody on the ground. They're not moving.", "There's someone lying on the sidewalk and there's blood everywhere.", "I think they're dead. I'm not touching them.",
    "I just found someone. They're not breathing, I don't think.", "There's a body. There's a body here.", "They're just lying there. Their eyes are open."],
  callAssault: ["Some guy just beat the hell out of someone.", "This guy just attacked somebody, out of nowhere.", "There's a fight- no, he's just hitting them, they're on the ground-",
    "Someone just got jumped. They're hurt."],
  callStabbing: ["Somebody just got stabbed. There's so much blood.", "He cut someone! He just cut them with a knife!", "Someone's been stabbed. They're bleeding out here.",
    "He had a knife. He- the other person's down."],
  callShooting: ["Somebody just got shot!", "There's been a shooting, someone's been shot!", "He shot someone. He just walked up and shot them.", "Shots fired, somebody's hit, please hurry!"],
  callShots: ["I just heard gunshots. Like, a lot of them.", "There's shooting. I heard shots.", "Somebody's firing a gun out here.", "Gunshots, close. Really close."],
  callMurder: ["He killed someone. I watched him do it.", "Somebody just got killed. I saw it.", "They're dead. That guy killed them. I saw the whole thing."],
  callMenace: ["There's a guy pointing a gun at people.", "This guy's waving a gun around. He pointed it at me.", "A man with a gun. He's threatening people."],
  callDesc: ["It was {desc}. He went that way.", "Uh- {desc}. I didn't see his face really.", "{desc}. He's still around here somewhere.", "Yeah, {desc}. Please hurry."],

  /* -------------------------------- the police -------------------------------- */
  copChallenge: ["Police! Drop the {weapon}!", "Drop it! Drop it now!", "Put the {weapon} down! Do it now!", "Police! Let me see your hands!", "Drop the {weapon} and step back!",
    "Last warning! Put it down!", "Weapon on the ground! NOW!", "Police! Don't move! Drop it!"],
  copHalt: ["Police! Stop right there!", "That's enough! Step away from them!", "Hey! Hands where I can see them!", "Stop! Don't make me draw on you!", "Back away! Now!",
    "On the ground! Get on the ground!", "Police! Leave them alone!"],
  copFire: ["Shots fired! Shots fired!", "Engaging!", "Dispatch, shots fired, officer needs assistance!", "Contact! Contact!", "Dispatch, I've had to fire!"],
  copSubdue: ["That's it. You're coming with me!", "Stop resisting!", "Get down! Get down on the ground!", "You were warned!", "Stay down!"],
  copDown: ["Suspect down.", "Stay down. Don't move.", "Don't get up. Stay right there.", "Dispatch, suspect's down. Send EMS.", "Stay on the ground!"],
  copCalm: ["Keep your hands where I can see them.", "Good. Stay just like that.", "Nobody else needs to get hurt. Stay still.", "Don't reach for anything.", "That's it. Nice and slow.", "Don't move. I mean it."],
  copClear: ["All clear.", "Dispatch, scene's quiet. Returning to post.", "Move along, folks. Nothing to see.", "Standing down.", "Okay. Back to it.", "Dispatch, resuming patrol."],
  copIdle: ["Dispatch, all quiet by the park.", "Quiet shift. I don't like it.", "Six more hours.", "Somebody owes me a coffee.", "Keep it moving, please.", "Radio check. Loud and clear.",
    "Paperwork can wait ten minutes.", "Have a good one.", "Nothing to report.", "These boots are killing me."],
  copReload: ["Reloading!", "Changing mags! Cover me!", "Reloading, cover!", "Mag change!"],
  copRespond: ["Dispatch, I'm on my way.", "Everybody stay back! Police!", "Out of the way! Police!", "Which way did he go?", "Clear the street!", "Police! Coming through!"],
  copGreet: ["Afternoon.", "Help you with something?", "Everything okay?", "Move along, please.", "Stay out of trouble.", "Afternoon. Take care."],
  copMedic: ["Dispatch, I need EMS here.", "Stay with me. Help's coming.", "Don't move them. Ambulance is on the way.", "Dispatch, one injured, send medics.", "Give them some room, please."],
  copTaser: ["Taser! Taser! Taser!", "Stop or you're getting tased!", "Taser, taser!", "Last chance! You'll be tased!"],
  copCuff: ["Hands behind your back.", "You're under arrest.", "Don't resist.", "Stay still. Cuffs are going on.", "You're under arrest. Don't move."],
  copCustody: ["Dispatch, one in custody.", "Suspect in custody, bringing them in.", "One in cuffs. Walking them back.", "Dispatch, one detained."],
  copWalk: ["Keep moving.", "This way.", "Walk. Slowly.", "Eyes front. Keep walking."],
  copDispatch: ["Copy. En route.", "Dispatch, copy, I'm on my way.", "Copy that. Show me responding.", "Ten-four. Heading over now.", "Copy. Two minutes out."],
  copScan: ["Running prints.", "Dispatch, I'm on scene. Checking prints.", "Hold on, let's see who touched them.", "Scanning. Give me a second."],
  copPrintsHit: ["Got a hit. Dispatch, prints are a match. All units, suspect is {desc}.", "Prints came back. We know who did this. Find {desc}.",
    "Dispatch, I've got a match on the prints. All units be advised, {desc}, considered dangerous.", "There it is. His prints are all over the body. Let's go find him."],
  copPrintsNone: ["Nothing. No prints on file.", "Dispatch, no match on the prints.", "Prints are no good. Whoever did this didn't leave much.", "Nothing usable. Damn."],
  copNothing: ["Dispatch, I'm at the location. Nothing here.", "Nothing. Whatever it was, it's gone.", "Dispatch, no sign of anything. Clearing."],
  copSearch: ["Dispatch, no sign of him on this block.", "Anybody seen this guy?", "Checking the alley.", "Nothing here. Moving on.", "Dispatch, still looking.", "He's around here somewhere."],
  copSpotted: ["There he is! That's him!", "Dispatch, I've got eyes on the suspect!", "Police! Don't move! Stay right there!", "Suspect spotted! He's right here!", "Hey! You! Stop!"],

  /* ----------------------------- handcuffs, the cell ----------------------------- */
  cuffed: ["These are too tight.", "You can't do this. Let me go!", "I didn't do anything!", "Please. Take them off.", "I can't feel my hands.", "What am I being arrested for?",
    "This is a mistake. This is a mistake."],
  inCell: ["I want my phone call.", "This is a mistake.", "How long are you keeping me here?", "Hello? Is anybody there?", "I didn't do anything.", "My wrists are killing me."],

  /* ------------------------- answers to things you say ------------------------- */
  replyGreet: ["Hello.", "Hi there.", "Hey. Do I know you?", "Uh, hi.", "Yeah, hey."],
  replyHow: ["Not bad. Busy.", "Fine, thanks. You?", "Tired, honestly.", "Been better, been worse.", "Ask me after five.", "Fine. Why?"],
  replyName: ["{first}. Why?", "I'm {first}.", "{first}. And you are?", "{first}. Not that it's any of your business."],
  replyJob: ["I'm a {job}.", "{job}. Pays the rent. Barely.", "These days? {job}."],
  replyWhere: ["I'm {errand}.", "Just {errand}.", "Me? {errand}. Why?"],
  replyThreat: ["Okay! Okay! Whatever you want!", "Please, I don't want any trouble.", "Take it, just take it!", "Don't hurt me!", "I'll do whatever you say!"],
  replyThreatBrave: ["Or what?", "You don't scare me.", "Try it and see what happens.", "Walk away. Now.", "I've dealt with worse than you."],
  replySorry: ["It's fine. It's fine.", "Just be careful.", "Yeah, well. Okay.", "Sorry doesn't fix it.", "Okay. Apology accepted.", "Little late for sorry."],
  replyInsult: ["Charming.", "Same to you.", "What did you just say to me?", "Wow. Nice.", "Grow up.", "I'm not doing this today."],
  replyHelpHurt: ["Yes. Yes, help me. Please.", "Call an ambulance. Please.", "Don't leave me.", "I need a doctor.", "Press here. Hard."],
  replyHelpFine: ["I'm fine, thanks.", "No, I'm okay.", "Do I look like I need help?", "Nice of you. No."],
  replyGo: ["Gladly.", "You don't have to tell me twice.", "I'm going. I'm going.", "Fine by me."],
  replyStay: ["I'm not moving. See? Not moving.", "Staying right here.", "Okay. Okay. Standing still."],
  replyQuestion: ["I don't know.", "Why are you asking me?", "No idea, sorry.", "Couldn't tell you.", "Ask somebody else.", "What kind of question is that?"],
  replyDefault: ["Sorry, I'm in a hurry.", "Uh-huh.", "If you say so.", "Right...", "Okay then.", "I don't have time for this.", "Mm.", "Sure. Sure."],
  replyScared: ["Stay away from me!", "Don't talk to me!", "Get back!", "Leave me alone, please!", "I don't wanna hear it!"],
  replyHurt: ["Does it LOOK like I can talk?", "Not now. Not now.", "I can't... I can't talk.", "Just get help."],
  replyDeaf: ["WHAT? My ears are ringing!", "I can't hear you!", "Speak up! Everything's muffled!"],
  replyThanks: ["You're welcome.", "No problem.", "Anytime.", "Don't mention it."],
  replyYes: ["Good.", "Okay then.", "Glad we agree."],
  replyNo: ["Suit yourself.", "Fine.", "No? Okay."],
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
  return text.replace(/\{(\w+)\}/g, (m, key) => (vars[key] != null ? vars[key] : key === 'weapon' ? 'weapon' : key === 'part' ? 'arm' : key === 'desc' ? 'some guy' : ''));
}

/** A person's own habits of speech, laid over a stock line now and then. */
export function flavour(text, persona, mood) {
  if (!text || !chance(0.22)) return text;
  const q = persona.quirk || '';
  if (q.includes('polite')) return chance(0.5) ? 'Sorry- ' + lower(text) : text.replace(/[.!]$/, '') + ', if you don\'t mind.';
  if (q.includes('swears') && mood !== 'calm') return pick(['Shit. ', 'Fuck. ', 'Oh, for fuck\'s sake. ', 'Goddammit. ']) + text;
  if (q.includes('prays')) return pick(['Lord help me. ', 'God, please. ', 'Please, God. ']) + text;
  if (q.includes('dark jokes') && mood !== 'calm') return text + pick([' Great day for it.', ' Classic Tuesday.', ' Zero stars. Would not recommend.']);
  if (q.includes('filmed')) return text + pick([' Where\'s the camera?', ' This is a prank, right?']);
  if (q.includes('late')) return text + pick([' And now I\'m LATE.', ' I don\'t have time for this.']);
  if (q.includes('dog')) return mood === 'calm' ? text : text + pick([' Who\'s gonna feed Biscuit?', ' I gotta get home to my dog.']);
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
