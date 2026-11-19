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
    "Put it back, put it back, put it back-", "No. No no no no no.", "I can still feel it. How can I still feel it?", "Oh God. Oh God oh God oh God."],
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

/* ---------------------------------------------------------------------------
   More of the same, and lines for fire, ropes, generators and glass. Merged
   into LINES below: a category here adds to the one above, or starts it.
   ------------------------------------------------------------------------- */
const MORE = {
  idle: ["Where did I park?", "I should've brought an umbrella.", "Twelve bucks for a sandwich. Twelve.", "Okay. Bank, then pharmacy, then home.", "Did I lock the door? I locked the door.",
    "Smells like rain.", "My feet are killing me.", "I need a haircut.", "Is that place still open?", "This street's always under construction.", "I could really go for a nap.",
    "Note to self: call the dentist.", "Why is everybody in such a hurry?", "Ugh, Monday energy on a Thursday.", "Huh. They painted that."],
  bored: ["Come on, come on.", "This is taking forever.", "I could be home right now.", "Hm. Nothing.", "Wow. Riveting.", "I've counted every crack in this sidewalk.",
    "Somebody entertain me.", "Is it five yet?", "I'm gonna fall asleep standing up.", "Same old, same old."],
  phone: ["No, I'm almost there. Five minutes.", "Can I call you back? I'm on the street.", "You're breaking up. Hello?", "Yeah, I got the email. No, I didn't read it.",
    "Mom, I'm fine. I'm fine.", "Did you feed the dog?", "Okay, love you, bye. Bye. Okay, bye.", "Wait, say that again?", "He said WHAT?", "I'm putting you on speaker.",
    "Tell them I'm running late.", "No, the other one. The blue one."],
  greet: ["Hey there.", "Morning. Well, afternoon.", "How's it going?", "Hi.", "Yo.", "Hey, you doing alright?", "Afternoon.", "Hey. Weird weather, huh?"],
  greetBack: ["Hey yourself.", "Oh, hi.", "Doing alright, you?", "Hi... do I know you?", "Hey. Yeah.", "Mm-hm, hi.", "Afternoon.", "Oh. Hey."],
  chatA: ["Did you see the game last night?", "They're tearing down the old bakery, you hear?", "My landlord's raising the rent again.", "You ever been to that taco place on the corner?",
    "I swear this city gets louder every year.", "Rent's insane. Insane.", "My kid wants a snake now. A snake.", "You working this weekend?", "I'm thinking of getting a bike.",
    "They still haven't fixed that pothole.", "Did you get the thing I sent you?", "I'm so tired of this weather."],
  chatB: ["Oh, don't get me started.", "Ha. Yeah, right.", "No way. Seriously?", "Tell me about it.", "Huh. I didn't know that.", "I heard that too.", "That's wild.",
    "Honestly? Same.", "Wait, really?", "Mm. Could be worse.", "Yeah, no, totally.", "Hm. Maybe."],
  playerNear: ["Can I help you?", "You need something?", "Little close there, buddy.", "Uh. Hi.", "Personal space, man.", "You lost?", "You're kind of staring.", "Okay..."],
  bump: ["Excuse you.", "Whoa, sorry.", "Watch it!", "Hey, easy.", "My bad.", "Sorry, sorry.", "Jeez, okay.", "Do you mind?"],
  stumble: ["Whoa- whoa-", "Okay- okay, I'm good.", "Nope- nope- okay.", "Almost ate it.", "Jesus, my ankle."],
  trip: ["Ow! What the-", "Who left that there?!", "Son of a-", "Oh, come ON."],
  startle: ["Jesus!", "Oh my God, you scared me.", "What was that?!", "Holy- okay.", "Gah!", "My heart."],
  sawSpawn: ["Where'd YOU come from?", "Uh. Was that there before?", "Okay, that's... new.", "I'm losing my mind.", "Did anyone else see that?", "That's not normal. Is that normal?"],
  sawFist: ["Hey! Break it up!", "Whoa, whoa, whoa!", "Somebody stop them!", "Is this a fight? Is this a real fight?", "Leave them alone!", "Oh, that's not good."],
  sawWeapon: ["Oh no. Oh no no no.", "Put that down, man.", "He's got a {weapon}. Everybody, he's got a {weapon}.", "Is he gonna use that?", "Don't look at him. Don't look at him.", "Okay, I'm leaving. I'm leaving now."],
  aimedAt: ["Okay! Okay! Don't shoot!", "Please, I have kids.", "I'm not gonna do anything. I swear.", "Take whatever you want.", "Please. Please don't.", "Easy. Easy. I'm not moving.",
    "Whatever this is, I'm not part of it.", "I didn't see anything. I didn't see your face."],
  surrender: ["My hands are up! They're up!", "I'm not armed!", "I give up, I give up!", "Don't hurt me. Please.", "See? Nothing. Empty hands.", "I'm on your side, okay? I'm on your side."],
  gunshot: ["Was that a gunshot?!", "Get down! Get DOWN!", "Oh God, somebody's shooting!", "That was a gun. That was a gun.", "Where's it coming from?!", "Everybody down!",
    "That was close. That was so close.", "Not again. Not again."],
  flee: ["Run! Just run!", "Out of the way! Move!", "I'm not dying here. Not today.", "Go! Don't look back!", "This way, come on!", "Get away from him!", "Somebody help us!", "Keep running!"],
  cower: ["Please let it be over.", "Don't see me. Don't see me.", "I just want to go home.", "Shh. Shh. Stay quiet.", "Oh God, oh God, oh God.", "I can't breathe. I can't breathe.",
    "Please, please, please.", "Make it stop."],
  sawAttack: ["Somebody do something!", "He's hurting them!", "Stop! You'll kill them!", "Oh my God, the blood-", "No! NO!", "Get off of them!"],
  sawShot: ["He just shot that guy!", "Oh God, they're shot!", "Is he dead? Is he dead?!", "Somebody call 911! Somebody's been shot!", "He's got a gun! Run!", "Oh no. No no no."],
  sawDeath: ["They're not moving.", "Oh no. Oh, no.", "Is- is that it? Are they gone?", "Somebody check their pulse.", "I just watched somebody die.", "I'm gonna be sick."],
  sawDismember: ["That's- that's not- oh God.", "I can't unsee that.", "That came OFF.", "Jesus Christ. Jesus Christ."],
  sawHeadless: ["Where's- where's the rest of-", "No. Nope. Nope.", "Oh my God, his head-"],
  sawCorpse: ["Is that a body?", "Hey. Hey! Are you okay?", "Oh God, there's somebody lying there.", "Don't touch them. Don't touch anything.", "Somebody call an ambulance.", "Are they breathing?"],
  sawBlood: ["Is that blood?", "That's a lot of blood.", "Somebody's hurt. Somebody's really hurt.", "Where's all that blood from?", "Oh, that's fresh."],
  sawHurt: ["Are you okay? Hey!", "Don't move, you might be hurt.", "Can you hear me?", "Stay down, help's coming.", "Oh no, are you alright?", "Talk to me. Talk to me."],
  sawCarHit: ["That car just hit somebody!", "Oh my God, did you see that?!", "He didn't even brake!", "Somebody check on them!"],
  carNear: ["Hey! Watch where you're going!", "Slow down!", "Jesus, that was close.", "Idiot!"],
  horn: ["Yeah, yeah, I'm moving.", "Okay! I hear you!", "Relax, buddy."],
  crate: ["What the hell was that?", "Where'd that come from?", "Somebody could get hurt."],
  hitBlunt: ["Ah! You son of a-", "What the hell?!", "Ow, okay, OW.", "Gah- my {part}!", "Stop it!", "That really hurt!"],
  hitCut: ["I'm bleeding! I'm bleeding!", "It went deep- it went deep-", "Look at my {part}-", "Why would you do that?!", "Get away from me! Get away!"],
  hitStab: ["It's- it's in me-", "Oh God, it's warm-", "I can't- I can't feel-", "Pull it- don't pull it out-", "Help- help-"],
  hitShot: ["I'm shot, I'm shot-", "I can't feel my {part}.", "Oh God, I'm bleeding everywhere.", "It went through- it went right through-", "Aah- why-"],
  hitUnseen: ["Who did that?!", "Something got me-", "Where are they?!", "Show yourself!"],
  hitCar: ["Didn't- didn't see it coming-", "My hip, my hip-", "Is the car gone?"],
  hitVest: ["Ugh, that's gonna leave a mark.", "Thank God for the vest.", "Knocked the wind right out of me."],
  hitHelmet: ["My ears are ringing.", "Helmet. Helmet got it.", "Ugh. Everything's spinning."],
  boneBreak: ["It's broken. Don't touch it!", "I heard it snap. I HEARD it.", "Something's wrong with my {part}. Really wrong.", "I can't put weight on it.", "Oh God, it's bent."],
  lostLimb: ["Where's my {part}?! Where is it?!", "Get it- someone get it-", "It's just- gone.", "No. No. That's not mine. That's not mine."],
  bleeding: ["Press on it. Somebody press on it.", "It's soaking through.", "There's so much of it.", "I'm getting dizzy.", "Am I gonna bleed out?", "Belt. Tourniquet. Something."],
  downPain: ["Somebody... anybody...", "It hurts to breathe.", "Don't move me. Don't move me.", "I think something's broken.", "Just... give me a minute.", "Mom...", "Please...", "Ow... ow..."],
  crawl: ["Almost there...", "Just a little further...", "Come on, move...", "Gotta get out of the street."],
  faint: ["Everything's... far away...", "I need to sit down. Now.", "Ears are ringing...", "Whoa. Head rush."],
  dying: ["Tell them I'm sorry.", "I can't feel my hands.", "Is it supposed to be this quiet?", "Stay with me. Please stay.", "I don't want to go.", "Just... hold on to me."],
  cold: ["So cold. Why's it so cold?", "My teeth won't stop chattering.", "Somebody give me a jacket.", "I can't feel my feet."],
  cantBreathe: ["Can't- get- air-", "My chest- it's- tight-", "Hhh- help- hhh-", "Something's- in my- throat-"],
  nausea: ["Oh no. Here it comes.", "Gonna be sick. Gonna be sick.", "Bucket. Anything.", "Ugh, my stomach."],
  afterVomit: ["Water. I need water.", "Don't look. Please don't look.", "Oh God, that's disgusting."],
  blind: ["I can't see! Everything's black!", "My eyes- my eyes-", "Where is everybody? I can't see!"],
  deaf: ["What? WHAT?", "I can't hear anything but ringing.", "Say it louder!"],
  paralysed: ["Why can't I move my legs?", "Move. Move. Come on, move.", "I'm stuck. I can't get up."],
  wake: ["Ugh. My head.", "What... what happened?", "How long was I out?", "Why am I on the ground?"],
  getUp: ["Okay. Up. I'm up.", "Ow. Everything hurts.", "Easy. Easy does it.", "I'm alright. I think."],
  tased: ["Gghhhaaah-!", "Nnnngghh-!", "Aaaghh- stop- stop-!"],
  afterTase: ["That was- the worst thing- ever.", "I can't feel my legs.", "My whole body's buzzing.", "Why. Why would you do that."],
  fight: ["You want some?! Come on!", "Back off!", "Big mistake, buddy!", "I'm not scared of you!", "Try that again!", "Come here!"],
  fightWin: ["Stay down!", "That's what you get!", "Had enough?", "Don't get up."],
  relief: ["Oh thank God.", "I think it's over.", "Okay. Okay. Breathe.", "I'm alive. I'm actually alive.", "My hands are still shaking.", "Is everybody okay?"],
  mourn: ["Wake up. Please wake up.", "Somebody help! Please!", "Stay with me, okay? Stay with me.", "This isn't happening.", "Don't you dare die on me."],
  gawk: ["Whoa. What happened here?", "Is that... is that real?", "Somebody's filming this, right?", "Should we do something?", "I'm not getting involved."],
  call911: ["Hi, yes, I need the police.", "Hello? I need to report something.", "Please, you have to send someone.", "Yes, I'm calling to report an emergency."],
  callBody: ["There's somebody on the ground. They're not moving.", "I think they're dead. I don't know.", "Somebody's lying here and there's blood.", "Please send an ambulance. And the police."],
  callAssault: ["Some maniac just attacked a guy.", "He beat someone up right in front of me.", "There was a fight, and now somebody's hurt bad."],
  callStabbing: ["Someone got cut. Bad.", "There's a guy with a knife. Somebody's bleeding.", "They were stabbed. There's blood everywhere."],
  callShooting: ["Somebody's been shot. Please hurry.", "There's a shooter. Someone's down.", "He shot him. He just shot him."],
  callShots: ["I just heard shots. A bunch of them.", "Gunfire, I heard gunfire.", "I think I heard a gun go off."],
  callMurder: ["Someone's been killed. I saw it.", "He killed a man. Right in front of me.", "Somebody's dead. He did it."],
  callMenace: ["There's a man waving a weapon around.", "Some guy's threatening people.", "He's armed and he's scaring everyone."],
  callDesc: ["{desc}. Please hurry.", "It was {desc}. I didn't get a good look at the face.", "I think {desc}. Yeah."],
  copChallenge: ["Put the {weapon} down, now!", "Drop it! Drop the {weapon}!", "Hands where I can see them!"],
  copHalt: ["Police! Stop right there!", "Don't move!", "Stay where you are!"],
  copFire: ["Shots fired! Shots fired!", "Suspect is armed!", "Taking fire!"],
  copDown: ["Suspect down!", "Stay on the ground!", "Don't you move!"],
  copCalm: ["Easy now. Nobody needs to get hurt.", "Keep those hands up.", "Slowly. Nice and slow."],
  copIdle: ["Quiet day.", "Coffee's terrible today.", "Anybody want to grab lunch?", "Another day, another dollar."],
  copRespond: ["Show me en route.", "On my way.", "Copy that, responding."],
  copSearch: ["Dispatch, nothing in this block.", "Check the side streets.", "Keep your eyes open."],
  copSpotted: ["There! That's the guy!", "Suspect sighted!", "Police! Freeze!"],
  cuffed: ["I want a lawyer.", "You're making a mistake.", "This is police brutality.", "Ow, my wrists!"],
  inCell: ["I want my phone call.", "How long am I gonna be in here?", "This is ridiculous."],
  replyGreet: ["Oh, hey.", "Hi. Do I know you?", "Hey, what's up?"],
  replyHow: ["Honestly? Not great.", "I've been better.", "Fine, I guess. You?", "Long day."],
  replyName: ["Why do you want to know?", "I'd rather not say.", "{first}. Why?"],
  replyJob: ["I'm a {job}. For now.", "{job}. It pays the bills. Barely."],
  replyWhere: ["Just {errand}.", "Out. Just out."],
  replyThreat: ["Please, I don't want trouble.", "Okay, okay, I'm going.", "You don't have to do this."],
  replyThreatBrave: ["You don't scare me.", "Try it and see what happens.", "Is that supposed to scare me?"],
  replySorry: ["It's fine. Just... be careful.", "Yeah, okay. Apology accepted. I guess."],
  replyInsult: ["Wow. Rude.", "What is your problem?", "Same to you, pal."],
  replyHelpHurt: ["Please, my {part}-", "Stay with me. Please.", "Get somebody. Anybody."],
  replyQuestion: ["Good question.", "No idea, honestly.", "Ask somebody else.", "Hm. I don't know."],
  replyDefault: ["Huh?", "Uh-huh.", "Okay.", "Sure.", "If you say so.", "Right."],
  replyScared: ["Please just leave me alone.", "I don't want any trouble.", "Stay away from me."],
  replyThanks: ["No problem.", "Anytime.", "Don't mention it."],

  /* fire */
  onFire: ["I'm on fire! I'm on fire!", "AAAAH! IT BURNS!", "Put it out! PUT IT OUT!", "Help me! Somebody! I'm burning!", "Get it off! Get it OFF!", "AAAGH!",
    "Water! Water!", "Oh God, oh God, oh God-", "My skin- my skin-", "It won't go out!", "Roll! I gotta roll!", "HELP!", "It's in my hair- it's in my hair-",
    "Aaah- aaah- aaah-", "I can't- I can't- AAH!", "Somebody PLEASE!", "Make it stop!", "Hhhhaaaagh-!", "My face! My FACE!", "It's everywhere!"],
  burned: ["Is it out? Is it out?", "Don't touch me. Please don't touch me.", "My skin's coming off.", "It still burns. It's out and it still burns.", "I can smell it. I can smell myself.",
    "Water. Cold water. Please.", "Everything stings.", "Why did you do that? Why?", "I need an ambulance. I need a burn unit.", "My hands. Look at my hands."],
  sawFire: ["Oh my God, they're on fire!", "Somebody get a fire extinguisher!", "Roll! Stop, drop and roll!", "Get a blanket! A jacket! Anything!", "Call 911! There's a fire!",
    "Oh God, the smell.", "Don't touch them, you'll catch too!", "Somebody help them!", "They're burning alive!", "Water! Does anyone have water?"],
  sawBurn: ["He set them on fire!", "He's got a flamethrower! RUN!", "He just burned somebody alive!", "Get away from him! He's got fire!", "What kind of psycho-", "Oh my God, the fire-",
    "He's gonna burn us all!", "RUN!"],
  callBurning: ["Someone's on fire! Please, send a fire truck!", "Somebody set a person on fire!", "There's a guy with a flamethrower. He burned someone.",
    "They're burning. They're burning right in front of me.", "Fire! There's a person on fire!"],
  hearFlame: ["What's that roaring?", "Is something on fire?", "I smell smoke.", "Oh God, is that fire?"],

  /* ropes */
  tied: ["Hey! What are you doing?!", "Get this off me!", "Untie me! Right now!", "What is this, a rope? Are you serious?", "Let me go!", "What are you tying me to?!",
    "This isn't funny!", "Somebody help, he's tying me up!", "I can't get it off!", "Why are you doing this?"],
  untied: ["Finally.", "Okay. Okay, I'm loose.", "Thank God.", "Never do that again.", "My wrist's raw."],
  sawTied: ["Why is that guy tied up?", "Is that a rope? What's going on?", "Somebody untie that person!", "This is some sick stuff."],

  /* electricity */
  wired: ["Hey! Is that a wire?! Get it off me!", "What are you plugging into me?!", "Don't. Don't you dare turn that on.", "Is that live? Is that LIVE?!", "Get that cord away from me!",
    "What is this? What's it connected to?", "Somebody help, he's wiring me up!"],
  zapped: ["My heart. My heart's going crazy.", "I couldn't let go. I couldn't let go.", "Everything's tingling.", "My hand- it burned my hand-", "I think my heart skipped.",
    "I can taste metal.", "Ow. Everything hurts. Everything.", "What happened? Was that electricity?"],
  sawZap: ["They're being electrocuted!", "Don't touch them! You'll get it too!", "Cut the power! Somebody cut the power!", "Turn it off! TURN IT OFF!", "Oh God, they're shaking-",
    "Pull the plug!", "Use something wooden! Don't touch them!"],
  callShock: ["Someone's being electrocuted! There's a generator!", "Somebody's stuck on a live wire! Hurry!", "Somebody got electrocuted. They're not moving.",
    "There's live wires everywhere. Somebody's down."],

  /* machines and glass */
  hearEngine: ["What's that racket?", "Who's running a generator out here?", "Ugh, that noise.", "Is there construction?", "Can somebody turn that off?", "That thing's loud."],
  hearGlass: ["Was that glass?", "Something just broke.", "Who's breaking stuff?", "Careful, there's glass."],
  lightsOn: ["Whoa, bright.", "Who put a light out here?", "Huh. Nice light.", "That's blinding."],
  sawWall: ["Who built a wall here?", "That wasn't there a second ago.", "Is that a wall? In the middle of the street?"],
  shotThrough: ["They're shooting through the wall!", "Get away from the wall!", "It's not stopping bullets!"],

  /* cars: taken, crashed, burning, blown up */
  carjacked: ["Hey! HEY! That's my car!", "Get out of my car!", "What are you doing?! Get your hands off me!", "You can't- that's MY CAR!", "Somebody stop him! He's taking my car!",
    "My keys- my bag's in there!", "Are you insane?!", "Call the police! He took my car!", "Okay, okay! Take it! Just take it!", "Not the car, man, not the car-",
    "I just made the last payment on that!", "You son of a- GET OUT!"],
  crashed: ["Oh God. Oh God, the car.", "Is everyone okay? Is everyone okay?", "My neck- I can't turn my neck.", "Where did that come from?!", "I didn't- I was braking, I was BRAKING-",
    "The airbag... my face.", "Is that smoke? Is that smoke coming out?", "My chest. The belt- my chest.", "Okay. Okay. Breathe.", "I can smell petrol."],
  carFire: ["Get away from it! It's going to go!", "The car's on fire! MOVE!", "Get back! GET BACK!", "It's burning! Get everybody back!", "Fire! Fire! Somebody get an extinguisher!",
    "Get out of the car! GET OUT!", "Is anyone still in there?!", "Run! It's gonna blow!"],
  sawCrash: ["Oh, that's a crash. That's a bad crash.", "Did you hear that?! Somebody's hit!", "Call an ambulance! There's been a crash!", "Is anybody hurt?!", "That car's totalled.",
    "Oh no, oh no, they hit hard.", "Somebody check the driver!", "He came out of nowhere!"],
  sawCarFire: ["That car's on fire!", "Look at the smoke! It's burning!", "Is somebody in it?!", "Stay back from it!", "Somebody call the fire department!", "It's gonna blow up!"],
  sawExplosion: ["WHAT WAS THAT?!", "Get down! GET DOWN!", "Oh my God, it exploded!", "Is anybody- was anybody near it?!", "It's raining glass!", "I can't hear- I can't hear anything!",
    "It just went up! It just WENT UP!", "Get away! There might be another one!"],
  hearExplosion: ["Was that a bomb?!", "What the hell was that?!", "That was an explosion!", "Something just blew up!", "Did you feel that?!", "Oh God. Oh God, what was that."],
  runOver: ["He ran them over! He RAN THEM OVER!", "Stop the car! STOP THE CAR!", "There's someone under the car!", "Oh God, the wheels-", "He drove right over them!"],
};
for (const k in MORE) LINES[k] = [...new Set((LINES[k] || []).concat(MORE[k]))];

export const LINE_COUNT = Object.values(LINES).reduce((n, a) => n + a.length, 0);

const _last = new Map();

/** A line for a situation, never the same one twice running. */
export function line(category, vars = {}) {
  const list = LINES[category];
  if (!list) return '';
  let text = pick(list);
  for (let i = 0; i < 4 && _last.get(category) === text && list.length > 1; i++) text = pick(list);
  _last.set(category, text);
  text = text.replace(/\{(\w+)\}/g, (m, key) => (vars[key] != null ? vars[key] : key === 'weapon' ? 'weapon' : key === 'part' ? 'arm' : key === 'desc' ? 'some guy' : ''));
  // the lines say "he" of whoever did it; when it was a woman, so do they
  return vars && vars.sex === 'f' ? herOf(text) : text;
}

const HER = { He: 'She', he: 'she', him: 'her', Him: 'Her', his: 'her', His: 'Her', guy: 'woman', Guy: 'Woman', himself: 'herself' };
/** A line about a man, said about a woman instead. */
export function herOf(text) {
  return text.replace(/\b(He|he|him|Him|his|His|guy|Guy|himself)\b/g, (w) => HER[w]).replace(/\b([Aa]) man\b/g, '$1 woman');
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
