/* =============================================================================
   Everything a stickman can say, by situation. {me} is the speaker, {other}
   who they are talking to or about, {victim} someone something happened to,
   {part} a body part, {n} a number, {what} a thing (or, in gossip, something
   somebody did).

   Written to sound like people: short, plain, interrupted, scared when there is
   something to be scared of - the way somebody would really say it, not a joke
   about it.
   ========================================================================== */
import { pick } from '../core/util.js';

export const LINES = {
  /* ------------------------------- hello, goodbye ------------------------------ */
  greet: [
    "Hey.", "Hi there.", "Oh, hey {other}.", "Hi, I'm {me}.", "Hey, how's it going?", "Morning.", "Hiya.", "Oh- hi. Didn't see you there.",
    "Hey {other}, you alright?", "Hello.", "Hey, I'm {me}, by the way.", "How are you doing?", "Afternoon.", "Hey. You new around here?",
    "Oh, hello.", "Hey, what's up?", "Alright?", "Hi. {other}, isn't it?", "Evening.", "Hey, stranger.", "Oh good, a friendly face.",
    "Oh hey, look who it is.", "Hi. How's your day going?", "Hey. Busy round here today, isn't it?",
  ],
  greetFriend: [
    "{other}! How've you been?", "Hey, you! Come here.", "There you are. I was wondering where you'd got to.", "{other}! It's been ages.",
    "Oh, thank God, a face I know.", "Hey, {other}. Good to see you.", "Look at you! How are things?", "{other}! I was just thinking about you.",
  ],
  greetCold: ["Oh. It's you.", "...Hi.", "{other}.", "Right. Hello.", "What do you want?", "Hm.", "Great. Just who I wanted to see.", "Yeah, hi."],
  farewell: [
    "See you later.", "Right, I'm off.", "Take care, {other}.", "Catch you later.", "Bye, {other}.", "Look after yourself.", "Stay safe out there.",
    "I'll see you around.", "Right, I'd better go.", "Don't be a stranger.", "Later, {other}.",
  ],
  handshake: ["Nice to meet you.", "Good to meet you, {other}.", "Pleasure.", "{me}. Nice to meet you.", "Hi- yeah, nice to meet you."],
  highFive: ["Yes!", "Up top!", "Nice one, {other}!", "There we go!", "Ha! Yes!"],
  hug: ["Come here.", "Oh, come here, you.", "I'm so glad you're okay, {other}.", "Bring it in.", "I've missed you."],

  /* -------------------------------- small talk -------------------------------- */
  smalltalk: [
    "Did you sleep alright? I was up half the night.", "I really need a coffee.", "Have you eaten? I'm starving.", "I think it's going to rain later.",
    "My back's been killing me all week.", "Did you see the match last night?", "I keep meaning to start running again.",
    "My landlord still hasn't fixed the boiler.", "Is it just me, or has this week gone on forever?", "I'm trying to cut down on sugar. It's not going well.",
    "My neighbour's dog barked all night.", "Got any plans for the weekend?", "I keep meaning to call my parents back.", "Rent's gone up again. Can you believe it?",
    "I started a new book. Can't put it down.", "Do you know anywhere decent to eat round here?", "I left the house without my keys this morning.",
    "I've got the dentist tomorrow. Dreading it.", "Traffic was a nightmare earlier.", "I've been thinking about getting a cat.",
    "My phone's on two percent. Story of my life.", "I'm thinking of learning to cook properly.", "It's been quiet round here lately. Too quiet.",
    "Somebody's left a load of boxes lying around again.", "I swear this place gets stranger every day.", "I tried that new place on the corner. Not bad.",
    "Work's been mad lately.", "I need a holiday. A long one.", "You look tired. Have you been sleeping?", "I joined a gym. Went once.",
    "My cousin's getting married next month.", "I'm still trying to fix my bike.", "Did you hear about the break-in down the road?",
    "They're digging up the road again.", "I keep forgetting to water my plants.", "I'm painting the flat. Walls, not pictures.",
    "Honestly, I could do with an early night.", "My knee's been clicking when I walk.", "What do you do, anyway? For work, I mean.",
    "I burnt my toast this morning and set the alarm off.", "There were sirens all night. Did you hear them?", "I've been watching that new series. No spoilers.",
    "I tried giving up caffeine. Lasted a day.", "Do you think they'll ever finish that building?", "A friend of mine swears by cold showers. Not for me.",
    "I keep a first aid kit in my bag now. You never know.", "You can't walk five minutes round here without seeing something weird.",
    "I've been trying to drink more water.", "It's colder than it looks today.", "I've got so much washing to do.", "I heard they're opening a shop over there.",
    "Do you ever think about moving somewhere quieter?", "My flatmate keeps eating my food.",
  ],
  reply: [
    "Yeah, tell me about it.", "Ha, same.", "Oh, really?", "Mm.", "Fair enough.", "Yeah, I know what you mean.", "No way.", "Honestly, same here.",
    "Ugh, don't.", "Ha! Yeah.", "That's rough.", "Right?", "I've been saying that for ages.", "Huh. I didn't know that.", "Oh, nice.", "Yeah?",
    "Can't argue with that.", "Mm-hm.", "Sounds about right.", "You're not wrong, {other}.", "Oh, I hate that.", "Same old, same old.", "Fair.",
    "Good for you.", "I wouldn't know, to be honest.", "Ha. Classic.", "It's been one of those weeks.", "Seriously?", "Oh God, yeah.", "Don't get me started.",
  ],
  sadTalk: [
    "I haven't been sleeping.", "I keep thinking about {absent}.", "I miss {absent}. I really do.", "Some days I just don't want to get up.",
    "I don't know. Everything feels heavy lately.", "I keep replaying it in my head.", "Sorry. I'm not great company today.", "I just feel tired all the time.",
  ],
  sadReply: [
    "Hey. I'm here, okay?", "Do you want to talk about it?", "That sounds really hard, {other}.", "Take your time.", "You don't have to be okay all the time.",
    "Come on, let's get you a cup of tea.", "I'm sorry, {other}. I really am.",
  ],
  grumpy: ["What?", "Not now, {other}.", "I'm really not in the mood.", "Can you give me some space?", "Leave it.", "Don't start.", "Just leave me alone, yeah?", "What are you staring at?"],
  insult: [
    "You're a joke, {other}.", "Nobody here likes you. You know that, right?", "Get out of my face.", "You're all mouth.", "God, you're annoying.",
    "Do you ever stop talking?", "You think you're hard? You're not.", "Pathetic.", "Move. You're in the way.", "Look at the state of you.",
    "You haven't got a clue, have you?", "Keep walking, {other}.",
  ],
  insulted: ["Say that again.", "Excuse me?", "What did you just say?", "Say that to my face.", "Watch your mouth.", "Oh, you're going to regret that.", "Right. That's it.", "Who do you think you're talking to?"],
  insultedMeek: ["...Okay.", "Wow. Okay.", "There's no need for that.", "Fine. Whatever.", "That's not fair.", "Why would you say that?", "Alright. I'll go."],
  compliment: ["You're alright, {other}.", "I like your style.", "You always know what to say.", "It's good having you around, {other}.", "You look well.", "You're a good friend, you know that?"],
  thanksCompliment: ["Oh- thanks.", "That's really kind.", "Thanks, {other}. I needed that.", "Stop it. But thank you.", "Aw. Cheers.", "You're sweet."],

  /* ---------------------------------- hurting --------------------------------- */
  hurtSmall: ["Ow!", "Agh!", "Ah!", "Ow, ow.", "Ugh!", "Hey!", "Ouch.", "Nngh.", "Oof.", "Argh, that stings.", "Okay, ow.", "Ah- dammit.", "Ow! Watch it!", "That hurt."],
  hurtBig: ["AAGH!", "AH- GOD!", "ARGH!", "OW! OW!", "AAH- STOP!", "Oh God, that hurt!", "AGH! What the hell?!", "NNGH!"],
  hurtPart: {
    head: ["My head...", "Agh- my head!", "Ow, my face!", "Everything's spinning...", "My nose- I think it's bleeding."],
    torso: ["Winded me... can't...", "My ribs...", "Oof- right in the stomach.", "Can't breathe- give me a sec."],
    armA: ["My arm!", "Agh, my elbow!", "My wrist!"], armB: ["My arm!", "My shoulder!", "Ow, my hand!"],
    legA: ["My leg!", "Agh, my knee!", "My ankle!"], legB: ["My leg!", "My shin!", "Ow- my foot!"],
  },
  broken: [
    "It's broken. I heard it go.", "My {part}! I think it's broken!", "I heard it snap!", "My {part}- it's not supposed to bend like that.",
    "Don't touch it! Don't touch it!", "I can't move my {part}!", "Oh God, my {part}. It's definitely broken.",
  ],
  brokenRibs: ["My ribs- I can't breathe properly.", "I think I've cracked a rib.", "It hurts to breathe.", "Every breath- agh. My ribs."],
  brokenSpine: ["My back! I can't feel my legs!", "I can't move my legs. Why can't I move my legs?", "Don't move me. Something's wrong with my back.", "I can't feel anything below my waist."],
  brokenSkull: ["My head... something's wrong...", "Everything's blurry...", "I can't- I can't think straight.", "There's blood coming out of my ear..."],
  brokenPelvis: ["My hip! I can't get up!", "Don't- don't move me. My hips...", "I can't put any weight on it."],
  paralysed: ["I can't move!", "I can't feel my arms...", "Help me. I can't move anything.", "Why can't I move? Why can't I move?", "Somebody... please. I can't feel my body."],
  dying: ["I don't... feel good...", "Tell them... I'm sorry...", "It's so cold...", "I can't... see properly...", "Stay with me... please...", "I'm so tired...", "Is someone there?", "I don't want to die..."],

  /* ---------------------------------- fighting -------------------------------- */
  betrayed: ["{other}?! What the hell?!", "I thought we were friends!", "Why would you do that, {other}?", "Are you serious? Me?", "After everything, {other}?"],
  angryAt: ["You'll pay for that.", "Come here!", "Right. That's it, {other}.", "You want a fight? Fine.", "Big mistake, {other}.", "You're going to regret that.", "Oh, you've done it now."],
  fightStart: [
    "Come on, then!", "Let's go.", "Hands up.", "You and me, {other}. Right now.", "Come on!", "You want some?", "Right. Come here.",
    "I'm not backing down, {other}.", "Let's settle this.", "You started this, {other}.", "Go on, then. Try it.", "You asked for it.",
  ],
  taunt: ["Is that it?", "Come on!", "Get up.", "Had enough?", "Stay down.", "That all you've got?", "You're slow.", "Who's next?", "Go on, try again.", "Keep your guard up next time."],
  fear: ["Help!", "Stay away from me!", "Please, stop!", "I don't want to die!", "Get away from me!", "Somebody help me!", "Leave me alone!", "Please, I don't want any trouble!"],
  flee: ["Run!", "Go, go, go!", "I'm getting out of here!", "Move!", "Help!", "Get away! Run!", "Nope. No way.", "Get out of here!"],
  beg: ["Please! Stop!", "Okay, okay, you win!", "Don't hurt me, please!", "I'm sorry! I'm sorry!", "Enough! Please!", "I give up! I give up!", "Please, I've got a family."],
  spare: ["Fine. Get out of here.", "Stay down.", "That's enough.", "Walk away. Now.", "Don't let me see you again.", "You're not worth it."],
  witnessHit: ["Whoa!", "Hey! Stop that!", "Oh my God!", "Jesus!", "Hey! Leave it!", "That's not okay!", "Oh, that's got to hurt.", "Stop! Someone stop them!"],
  defendFriend: ["Leave {victim} alone!", "Get away from {victim}!", "Back off! Now!", "Touch {victim} again. I dare you.", "Hey! Get your hands off {victim}!"],
  cheerFriend: ["Go on, {other}!", "Get them!", "Come on, {other}! You've got this!", "Watch their left!", "Yes! Keep going!", "Hit them back!"],
  stopFight: ["Stop it! Both of you!", "Hey! Break it up!", "Enough! That's enough!", "Pack it in! Someone's going to get hurt!", "Seriously, stop!"],
  victory: ["Yeah!", "Stay down.", "That's what you get.", "Done.", "Don't get up.", "Anyone else?", "Ha. Yeah.", "Next time, think twice."],
  surrender: ["Okay! Okay! I'm backing off!", "Easy... easy...", "I don't want any trouble!", "Put the knife down, {other}. Please.", "Alright, you win. I'm going."],
  mock: ["Ha! Look at {victim}!", "Down you go!", "Nice one, {victim}!", "Get up, {victim}! Oh, wait.", "Ha! Did you see that?"],

  /* ---------------------------------- weapons --------------------------------- */
  weaponGet: ["Brass knuckles. Okay.", "These'll do.", "Heavy.", "Right. Nobody start anything.", "Hope I don't have to use these."],
  weaponSee: ["Are those knuckledusters?", "Someone's left brass knuckles here.", "Who leaves those lying around?", "Is that a knuckleduster?"],
  weaponFear: ["{other}'s got knuckledusters!", "Whoa, put those away!", "Easy, {other}. Easy.", "Come on, {other}, you don't need those."],
  knifeGet: ["A knife. Okay. Careful.", "I'm keeping hold of this.", "Nobody come any closer.", "I don't want to use this.", "That's sharp. Really sharp."],
  knifeSee: ["Is that a knife?", "Who leaves a knife lying around?", "There's a knife on the floor.", "I don't like that. A knife.", "Someone should pick that up before someone else does."],
  knifeFear: ["{other}'s got a knife!", "Put the knife down, {other}!", "Whoa, whoa! Knife!", "Knife! Everybody back!", "Don't come near me with that!", "{other}, put it down. Please."],
  stabbed: ["I've been stabbed!", "{other} stabbed me!", "There's- there's a knife in me.", "I'm bleeding! I'm bleeding!", "Oh God, it went in.", "Help me! I've been stabbed!"],
  cut: ["It cut me!", "Agh! I'm cut!", "I'm bleeding!", "Ow- it's deep.", "Agh- that's sharp!"],
  sawStab: ["{other} stabbed {victim}!", "Oh my God, a knife!", "Somebody stop {other}!", "{victim}! No!", "Call an ambulance! {victim}'s been stabbed!"],
  knifeStuckSee: ["{victim}, don't pull it out!", "Don't move, {victim}! Leave it in!", "Oh God, {victim}... it's still in.", "Keep still. Help's coming.", "There's a knife in {victim}!"],
  pullOut: ["I have to get it out...", "Okay... on three...", "This is going to hurt.", "Hnngh-! Agh!", "Come on... come on..."],
  pullKnifeHelp: ["Hold still, {other}.", "Look at me, not at it.", "Deep breath, {other}.", "Press here. Hard.", "I've got you. Keep pressure on it."],
  throwKnife: ["Don't run, {other}!", "Get back here!", "Hey!", "Stop!"],

  /* ---------------------------------- machete --------------------------------- */
  macheteGet: ["A machete. Right.", "Everybody back up.", "This thing's heavy.", "Nobody move.", "I'll use it. Don't make me.", "Okay. Okay. Stay back."],
  macheteFear: ["{other}'s got a machete!", "Machete! Run!", "Put that down, {other}!", "Get back! {other}'s got a blade!", "Easy with that, {other}...", "Nobody go near {other}!"],
  chopped: ["AAGH! My- AAGH!", "{other} cut me!", "I'm cut open! Oh God!", "It went right in!", "Stop! Stop swinging it!", "Help me, I'm bleeding badly!"],
  sawChop: ["{other} just hit {victim} with the machete!", "Oh God, the machete!", "Somebody stop {other}!", "{victim}! Get away from them!", "Call an ambulance! Now!"],

  /* ----------------------------------- guns ----------------------------------- */
  gunGet: ["A gun. Okay. Is it loaded?", "This changes things.", "Nobody move.", "Heavier than it looks.", "I don't want to use this.", "Where's the safety on this thing?", "Right. Everybody calm down."],
  gunFear: ["{other}'s got a gun!", "Gun! Everyone down!", "Put the gun down, {other}!", "Whoa, whoa, whoa! Easy!", "Is that thing loaded?!", "Don't point that at me!"],
  aimAt: ["Don't move, {other}!", "Hands where I can see them!", "Stay right there!", "Back off! I mean it!", "I will shoot, {other}! I will!", "On your knees! Now!", "Don't make me do this."],
  shootStart: ["You asked for this.", "That's it!", "I warned you, {other}!", "Enough!", "I told you to stop!"],
  backDown: ["That's what I thought.", "Walk away.", "Smart.", "Keep your hands up.", "Go on. Get out of here.", "Don't come back."],
  reload: ["Reloading!", "Changing mag!", "Cover me!", "Hold on... hold on...", "Come on, get in-"],
  outOfAmmo: ["No- I'm out!", "Empty!", "I'm out! I'm out!", "Come on, come on...", "Dammit, no rounds!"],
  outOfAmmoSee: ["{other}'s out! Go!", "They're empty! Now!", "Now! While they're reloading!", "They're dry! Move!"],
  surrenderGun: ["Don't shoot!", "Okay, okay! Don't shoot!", "I'm not moving! I'm not moving!", "Please, {other}, put it down!", "I'm unarmed!", "Easy! Easy! My hands are up!"],
  relief: ["Oh, thank God.", "Okay. Okay. Breathe.", "I thought I was dead.", "My heart's going a mile a minute.", "That was too close."],
  gunshots: ["Gunshots!", "Was that a gun?!", "Everybody get down!", "What was that?!", "Someone's shooting!", "Shots! Get down!", "Was that a gunshot?"],
  sawShooting: ["{other}'s shooting at {victim}!", "{other} has a gun!", "Stop shooting, {other}!", "Get down, {victim}!", "{victim}, get out of there!"],
  takeCover: ["Take cover!", "Get behind something!", "Down! Get down!", "{other}'s shooting!", "Everyone get down!", "Stay low!"],
  nearMiss: ["That was close!", "Jesus, that nearly hit me!", "I felt that go past!", "They're shooting at me!", "Too close!"],
  // something blowing up: heard, seen, and caught in it
  heardBlast: ["What the hell was that?!", "Was that an explosion?!", "Something just blew up!", "That came from over there!", "Did you feel that?", "Get down!", "That sounded like a bomb!", "Oh God, what was that?"],
  sawBlast: ["Oh my God!", "It blew up!", "GET DOWN!", "Did you see that?!", "Take cover!", "That was way too close!", "Get back! There could be another one!", "Is anyone hurt?!"],
  blastHurt: ["AAAH!", "My ears! I can't hear!", "Everything's ringing...", "It went off right next to me!", "What... what happened?", "I can't see- there's dust everywhere-", "Ow. Ow. Oh God."],
  shrapnelHit: ["Something hit me! Something sharp!", "There's metal in me!", "Agh! Something got me!", "I'm hit! I'm hit!", "It's in my leg!", "My side- something went in!"],
  shot: ["I'm hit!", "I've been shot!", "AAGH! {other} shot me!", "It burns!", "I'm shot! Oh God!", "Help! I'm shot!", "I can't- I've been shot..."],
  sawShot: ["{other} shot {victim}!", "{victim}! No!", "They shot {victim}!", "{victim}'s hit!", "Someone help {victim}!", "Call an ambulance! {victim}'s been shot!"],

  /* ------------------------------- wounds, gore ------------------------------- */
  severedSelf: [
    "MY {part}! MY {part}!", "Where's my {part}?!", "It's gone! My {part}'s gone!", "AAAAH! My {part}!", "I can't feel my- where's my {part}?!",
    "That's MY {part} on the floor!", "Oh God, oh God, my {part}...",
  ],
  sawBeheaded: [
    "Their head- their head came off!", "Oh God- {victim}- oh God...", "{victim}'s head is on the floor!", "I'm going to be sick.",
    "Don't look at it. Don't look at it.", "That's not real. That's not real.", "Jesus Christ... {victim}...",
  ],
  sawSevered: [
    "{victim}- oh God, it came off!", "It came right off!", "Oh God, oh God, oh God...", "{victim}! Tie something round it! Now!",
    "That's... that came right off.", "I think I'm going to be sick.", "Somebody get a belt on {victim}!",
  ],
  limbSee: ["Is that... a hand?", "Whose is that?", "That's {victim}'s...", "Is that a leg?!", "Oh God, that's part of someone.", "I'm not touching that."],
  retch: ["Oh God... I'm going to be sick...", "Hurk-", "Oh no. Oh no no.", "*gags*", "I can't- I need a second-", "Don't- don't look at it-"],
  faint: ["I feel... faint...", "The room's spinning...", "I need to sit... down...", "That's... a lot of blood...", "Everything's going white..."],
  sawFaint: ["{victim} fainted!", "Whoa, {victim}! Wake up!", "Somebody catch {victim}!", "{victim}'s gone down! Give them some air!"],
  shock: ["It's fine... it's fine... it's not fine.", "I can't feel it...", "Why is everything so quiet?", "I'm cold...", "Is this real?", "I'm okay. I'm okay. Am I okay?"],
  seeBlood: ["I'm bleeding!", "That's a lot of blood...", "Oh God, it won't stop.", "Look at it- look at all the blood.", "That's mine. That's my blood."],
  checkWound: ["Let me see...", "It's just a scratch.", "Not too bad. I think.", "That's going to need stitches.", "Okay. Pressure. Keep pressure on it."],
  dislocatedSelf: ["My {part}! It's popped out!", "My {part}'s out of the socket!", "AAH! My {part}!", "I can't move my {part}!", "Something's wrong with my {part}- it's out."],
  popBack: ["Hold still... this is going to hurt.", "On three. One-", "Deep breath, {other}.", "Trust me, {other}. I've done this before.", "Look at me, not at it."],
  relocated: ["AAGH! ...Oh. Oh, that's better.", "You said on three!", "Thanks, {other}... I think.", "It's back in. Oh, thank God.", "That felt horrible. But it's better."],
  tourniquet: [
    "Hold still, I need to tie this off.", "Press here. Hard!", "Stay with me, {other}! You're losing blood!", "This is going to be tight. It has to be.",
    "I've got you, {other}. I've got you.", "Keep pressure on it. Don't let go.",
  ],
  tourniquetThanks: ["Thank you... {other}...", "You saved my life, {other}.", "I owe you. I really do.", "It's stopped... it's stopped.", "I thought I was going to bleed out."],
  lostTooth: ["My tooth!", "You knocked my tooth out!", "Is that my tooth on the floor?", "I can taste blood- my tooth's gone.", "Oh God, my front tooth."],

  /* ----------------------------- remembering ---------------------------------- */
  recallHurt: [
    "I know you. You're the one who hit me.", "Stay away from me, {other}.", "I remember what you did, {other}.", "You again.",
    "Keep your distance, {other}.", "Back for more, {other}?", "Don't think I've forgotten.",
  ],
  recallShot: ["You shot me, {other}!", "It's you. You're the one who shot me.", "I know you, {other}. You shot at me.", "Stay away from me, {other}!", "You nearly killed me."],
  recallKill: ["You killed {victim}!", "I saw what you did to {victim}.", "Murderer!", "{victim}'s dead because of you, {other}.", "I know it was you. I saw you."],
  recallHelp: ["{other}! Thanks again for before.", "You helped me out back there. Thank you.", "{other}! I never thanked you properly.", "There's the one who saved me!", "I owe you one, {other}."],
  recallFriend: ["{other}! Good to see you again.", "Hey, {other}! Remember me?", "There you are, {other}!", "{other}! How have you been?"],
  heardOf: ["So you're {other}. I've heard about you.", "You're the one they told me about.", "{other}... I've heard things.", "Oh, you're {other}? Huh."],
  gossipBad: [
    "Did you hear? {victim} {what}.", "Watch out for {victim}. They {what}.", "Can you believe it? {victim} {what}.", "Keep away from {victim}. Apparently {victim} {what}.",
    "I'm telling you, {victim} {what}.", "I'm not saying anything, but {victim} {what}.",
  ],
  gossipGood: ["You know {victim}? They {what}. Good sort.", "{victim} {what}. Nice, right?", "If you're ever in trouble, find {victim}. They {what}.", "{victim} {what}. Not many people would."],
  gossipReplyBad: ["No way.", "I'll keep an eye on them.", "Really? That's awful.", "I'm staying away from them, then.", "I knew there was something off about them.", "Seriously? I had no idea."],
  gossipReplyGood: ["Good to know.", "Oh, that's nice.", "I'll remember that.", "Really? Huh.", "Good for them."],
  remindGood: ["Remember when you {what}? Thanks for that.", "I haven't forgotten. You {what}.", "You know, you {what}. That meant a lot.", "I still think about how you {what}."],
  remindBad: ["I haven't forgotten. You {what}.", "Just so you know, I remember. You {what}.", "Funny how you act like you never {what}.", "Don't pretend. You {what}."],
  enemySee: ["{other}.", "Not you again.", "Ugh. {other}.", "Well, if it isn't {other}.", "Stay away from me, {other}.", "I've got nothing to say to you, {other}.", "Keep walking."],

  /* ----------------------------- told what to do ------------------------------ */
  orderedFight: ["Sorry, {other}. Nothing personal.", "You and me, {other}.", "Come here, {other}.", "Let's get this over with, {other}.", "Right, {other}. Hands up.", "I'm coming for you, {other}."],
  orderedFightFriend: ["Sorry, {other}... I have to.", "Don't take this personally, {other}.", "I really don't want to do this.", "I'm sorry. I'm so sorry, {other}.", "Friends or not, {other}... here I come."],

  /* ---------------------------------- crates ---------------------------------- */
  crate: ["What's in here?", "Heavy box.", "Someone just left this here?", "Solid.", "It's empty, I think.", "Who keeps leaving boxes everywhere?", "Hm. A crate.", "Might be useful."],
  crateTop: ["I can see everything from up here.", "Okay, don't look down.", "Bit wobbly.", "Look, I'm up here!", "Good view, at least.", "Is this thing going to hold me?"],
  jumpOff: ["Here goes!", "Okay- jumping!", "Watch this.", "Hup!", "Mind out!"],
  crateHit: ["Who threw that?!", "Where did that come from?!", "Ow! That was a box!", "What the hell was that?!", "Someone's throwing things!"],
  blame: ["{other}! Did you throw that?!", "Was that you, {other}?", "Very funny, {other}.", "I saw that, {other}!", "Seriously, {other}?"],
  throwCrate: ["Catch!", "Heads up, {other}!", "Here, take this!", "Watch out!", "Have it!"],
  pinned: ["Get it off me!", "I can't move!", "Help! I'm stuck!", "It's crushing me...", "Somebody lift this!", "I can't- breathe- it's heavy-"],

  /* ------------------------------- bodies flying ------------------------------- */
  bodyHit: ["Watch it!", "Hey! Get off me!", "Ow! Where did you come from?!", "Watch where you're going!", "Agh! Someone just flew into me!"],
  sorry: ["Sorry!", "That wasn't me!", "Oof, sorry!", "I didn't mean to!", "Sorry, {other}! You okay?"],
  grabbed: ["Whoa! Put me down!", "AAH!", "What's happening?!", "Help!", "Let go of me!", "My feet- I'm off the ground!", "What's got me?!", "Put me down! Please!"],
  grabbedAgain: ["Not again!", "Why me?!", "Put me down!", "Again?!", "No, no, no, not this again!"],
  thrownLand: ["Ugh...", "I'm alive?", "What the hell keeps doing that?!", "Ow... everything hurts.", "That's going to bruise.", "I think I hit my head."],
  seeGrabbed: ["{victim}'s off the ground!", "What the...?!", "Put {victim} down!", "How is that happening?!", "Something's lifting {victim}!"],
  seized: ["Let go of me!", "{other}! Let go!", "I can't breathe!", "Put me down! Put me down!", "Somebody help me!", "No no no no!"],
  seeSeized: ["{other}'s got {victim}!", "Let {victim} go!", "{victim}!", "It's got {victim}!", "Somebody help {victim}!"],
  lookUp: ["Is someone up there?", "Hello? Up there?", "I swear something moved up there.", "What keeps picking people up?", "I feel like I'm being watched."],

  /* ---------------------------------- helping --------------------------------- */
  witnessDeath: ["No!", "{victim}?! {victim}!", "Oh my God...", "{victim}'s not moving!", "They killed {victim}!", "Is... is {victim} dead?", "Somebody call an ambulance!"],
  witnessDeathStranger: ["Oh no...", "Are they... dead?", "Oh God.", "Someone call an ambulance!", "Is anyone helping them?", "Oh my God, they're not moving."],
  grief: ["Why... {victim}...", "Wake up, {victim}... please...", "I'm so sorry, {victim}.", "{victim}... no...", "It's not fair...", "You didn't deserve this, {victim}."],
  avenge: ["This is for {victim}!", "You killed {victim}!", "You'll pay for {victim}!", "{victim} didn't deserve that!"],
  killedGuilt: ["I... I didn't mean to...", "What have I done?", "{victim}? Get up... please.", "Oh no. No no no.", "I only meant to stop them..."],
  killedProud: ["That's what you get.", "Stay down.", "You brought this on yourself.", "It's done.", "Shouldn't have started it."],
  killedAccident: [
    "{victim}?! No- that wasn't meant for you!", "I didn't see you! I didn't see you there!", "Oh God. Oh God, {victim}.",
    "It was an accident! I swear!", "What have I done... {victim}...", "No, no, no, not {victim}!",
  ],
  rushGun: ["Drop it!", "Get the gun!", "Now! Before they shoot!", "Grab it!", "Go, go, go!", "Get it off them!"],
  comfort: ["Are you okay?", "Hang in there, {other}.", "Let me help you up.", "You're going to be alright.", "I've got you.", "Stay with me, {other}!", "Help's on the way. Just breathe."],
  thanks: ["Thanks, {other}.", "Thank you...", "You're a good friend, {other}.", "I owe you one.", "Thank you. Really."],
  crawl: ["Help... me...", "My legs... I can't stand...", "Somebody...", "Just... a bit further...", "Please... someone..."],

  /* ---------------------------------- the rest -------------------------------- */
  dodge: ["Whoa!", "Close one!", "Missed!", "Hey!", "Nope!", "Watch it!", "Not this time!", "Too slow!"],
  bored: [
    "Hm.", "What now...", "I'm so bored.", "*yawns*", "Nothing ever happens round here.", "I should probably be doing something.", "Hm hm hm...",
    "I could go for a walk.", "What time is it?", "I need a hobby.", "Is it lunch yet?", "I should really clean the flat.",
  ],
  happy: ["What a day.", "I'm in a really good mood today.", "Life's good.", "I feel great, actually.", "Can't complain.", "Not a scratch on me.", "Today's a good day."],
  investigate: ["What was that?", "Hello?", "Who's there?", "Huh?", "Did something fall over?", "Is someone there?"],
  sawVanish: ["Where did {victim} go?!", "{victim}? {victim}?!", "They were right there...", "Did anyone else see that? {victim} just disappeared."],
  newcomer: ["Where did you come from?", "Oh! Hello.", "Didn't see you come in.", "Hey, a new face.", "Have you just got here?"],
  wake: ["Ugh... what happened?", "Where am I?", "My head...", "How long was I out?", "What... what time is it?", "Did I pass out?", "Five more minutes..."],
  getUp: ["Okay. Okay.", "Ugh.", "I'm fine. I'm fine.", "Up we get.", "Ow. Right.", "I'm alright.", "That floor's hard.", "Give me a second...", "Okay, I'm up.", "Nothing broken. I think."],
  scaredOfDead: ["There's a body...", "I don't like this.", "Is that... are they dead?", "Oh God. Someone should cover them up.", "Don't look at it."],
  mournStranger: ["Poor soul.", "Rest in peace.", "Who did this?", "Someone's going to miss them."],
  healed: ["I feel... better?", "It doesn't hurt anymore!", "How is that possible?", "My bones- they're fine!", "I feel like new."],
  hide: ["Hide!", "They won't see me here.", "Shh...", "Stay down. Stay quiet.", "Please don't find me."],
  panic: ["AAAAH!", "We're all going to die!", "Oh God, oh God, oh God!", "Everybody run!", "Somebody do something!"],
  lookAround: ["Hm?", "Huh.", "Anyone there?", "What's going on?"],
  rest: ["I need to sit down.", "Ow... just a minute.", "Phew.", "Give me a second.", "Just need a breather."],
  exercise: ["Right. Workout time.", "Got to stay in shape.", "Come on, a few more.", "One more set.", "Let's see if I can still do this."],
  exerciseCount: ["{n}.", "{n}...", "{n}! Come on.", "And {n}.", "{n}... nngh..."],
  exerciseDone: ["Done.", "That's enough for today.", "Phew. I'm going to feel that tomorrow.", "I'm soaked.", "Okay. Water."],

  /* ---------------------------------- breath ---------------------------------- */
  tired: [
    "Huff... huff...", "I need... a second...", "Out of... breath...", "My lungs are burning.", "I'm not as fit as I thought.",
    "Can we... stop for a sec?", "My legs are like jelly.", "I really need to do more cardio.", "Give me... a minute...",
  ],
  catchBreath: ["Just... give me a minute.", "Phew...", "Hold on... hold on.", "Too much... running.", "Breathe in. Breathe out.", "Okay... okay..."],
  breathBack: ["Okay. I'm good.", "Phew. Better.", "Right. Where was I?", "Okay, I can breathe again.", "Alright, I'm back.", "That's better."],

  /* -------------------------------- off balance -------------------------------- */
  stumble: ["Whoa-!", "Whoa, whoa, whoa!", "Wait-!", "Uh oh-!", "Whoops!", "No, no-!", "Careful-!"],
  caught: ["Phew. Still standing.", "Whoa. Okay.", "Nearly went over there.", "Okay, I'm alright.", "Steady... steady...", "That was close."],
  sawFall: ["Ouch. {victim} went down.", "Oof. You okay, {victim}?", "That looked like it hurt.", "Careful, {victim}!", "{victim}! You alright?"],
  mockFall: ["Ha! Look at {victim}!", "Nice trip, {victim}!", "Enjoy the floor, {victim}?", "Graceful, {victim}. Really graceful.", "Walk much, {victim}?"],
  sawCaught: ["Nice save, {victim}!", "Ooh, nearly!", "Good balance!", "Whoa, how are you still up, {victim}?"],

  /* --------------------------- holsters and pockets ---------------------------- */
  drawGun: ["Gun's out!", "Don't make me use this!", "Back off!", "Stay where you are!", "I'm not messing around!", "Nobody move!"],
  drawTaser: ["Taser's out. Back off.", "One more step and you get tased.", "Back off or I use this!", "Don't make me do it."],
  drawWeapon: ["I've got a {what}. Back off.", "Out comes the {what}.", "You see this {what}? Stay back.", "Good thing I kept the {what}."],
  putAway: ["Okay. Putting the {what} away.", "Don't think I'll need this now.", "Away it goes.", "Okay. It's over, I think.", "The {what} can go away now."],
  pocketed: ["I'll keep this {what} for later.", "That {what} can go in my pocket.", "Pocketed.", "Finders keepers.", "In the pocket. Just in case."],

  /* ----------------------------- vests, helmets, ammo ---------------------------- */
  helmetOn: ["Strap's tight. Okay.", "Better than nothing.", "Helmet's on.", "Should've put this on earlier.", "It fits. Good enough."],
  helmetSaved: [
    "My head- it hit the helmet. It hit the helmet.", "I got hit in the head... I'm okay. I think I'm okay.", "My ears are ringing. Something hit my helmet.",
    "That was my head. That was my head!", "It went off the helmet!",
  ],
  sawHeadBurst: ["Oh my God- {victim}'s head-", "No no no no no. {victim}...", "That's- that was {victim}'s head.", "Don't look. Don't look at it.", "{victim}! Oh God. Oh God."],
  sawHelmetStop: ["{victim} took one to the helmet!", "It went off {victim}'s helmet!", "{victim}! You okay? It hit your helmet!", "That helmet just saved {victim}'s life."],
  vestOn: ["Okay. Vest's on.", "Better safe than sorry.", "Straps done. Okay.", "Can't hurt.", "Right. Ready.", "It's tight. That's how it's meant to be."],
  vestSaved: [
    "OOF! The vest- the vest stopped it!", "That's going to bruise. But I'm alive!", "Like being kicked by a horse...", "I got shot! I- I'm okay?",
    "Owww. The vest. Thank God for the vest.", "Right in the chest. I'm still breathing.", "Can't- breathe- it didn't go through-",
  ],
  sawVestStop: ["The vest stopped it!", "{victim}'s vest took that one!", "It didn't go through!", "How is {victim} still standing?!"],
  ammoGot: ["{n} rounds. That'll do.", "Topped up.", "Loaded.", "Good. Full mags.", "That's enough to keep going."],
  ammoNone: ["Empty. Great.", "Nothing I can use.", "Who took all the ammo?", "Wrong calibre. Or empty.", "Nothing here."],

  /* --------------------------------- the taser -------------------------------- */
  taserFear: ["Is that a taser?", "Keep that thing away from me!", "Don't you dare tase me, {other}!", "Put that down, {other}.", "Is that thing on?"],
  taserGet: ["A taser. Okay.", "Anyone tries anything, they get this.", "Better than a gun, I suppose.", "Is it charged? It's charged.", "Nobody touch me. I mean it."],
  tased: ["AAAAGHHH!", "GRRRKKK!", "AH-AH-AH-AH!", "Nnnnngh!", "AAGH- STOP- STOP!", "GAAAH!", "NNNGH- OKAY- OKAY!"],
  tasedAfter: ["What... was that...", "Everything... tingles...", "Ow. Ow ow ow.", "I can't feel my legs properly.", "Never. Again.", "My whole body's shaking..."],
  driveStunned: ["OW! That burns!", "Agh! Stop!", "Stop it, {other}!", "AAGH!", "That's not funny, {other}!"],
  sawTased: ["{other} tased {victim}!", "Oh, that looked like it hurt.", "{victim} went stiff as a board!", "Is {victim} okay?!", "{victim} just dropped."],
  sawCopTase: ["They tased {victim}!", "{victim} went down like a plank.", "Easy, officer!", "{victim} isn't getting up for a bit.", "Did {victim} really deserve that?"],

  /* ---------------------------------- the law --------------------------------- */
  seeCop: ["Oh, a police officer.", "Hello, officer.", "Afternoon, officer.", "Police are here.", "Evening, officer.", "Everything alright, officer?"],
  seeCopRelief: ["Officer! Thank God!", "Officer! Over here!", "Finally, the police!", "Help! Officer, help!", "Took your time!"],
  seeCopGuilty: ["Uh oh. Police.", "Act natural...", "Oh no. Not the police.", "Just... walk normally.", "I didn't see anything. I wasn't here.", "Keep your head down."],
  reportMe: ["Officer! {victim} {what}!", "Officer, it was {victim}! They {what}!", "{victim} {what}! Arrest them!", "{other}! Do something! {victim} {what}!"],
  reportCrime: ["Officer! {victim} just {what}!", "Officer! {victim} {what}! Over there!", "You have to do something. {victim} {what}!", "I saw it! {victim} {what}!"],
  copThanks: ["Thanks. I'll deal with {victim}.", "Got it. Stay here.", "Understood. I'm on it.", "Okay. Leave {victim} to me.", "Noted. Stand back, please."],
  copSees: ["Police! {other}, stop right there!", "I saw that, {other}!", "That's assault! Stop!", "Police! Leave {victim} alone!", "Oi! {other}! Stop!"],
  copShotsFired: ["Shots fired! Shots fired!", "Everybody down!", "Control, shots fired! Requesting backup!", "Weapon! Get down!", "Shots fired! Moving in!", "Get down! Stay down!"],
  copStop: ["Police! Stop right there!", "{other}! Police! Don't move!", "Stop! Police!", "Don't move!", "Hold it right there, {other}!"],
  copGetDown: ["On the ground! Now!", "Get down! Hands where I can see them!", "Down, {other}! On your knees!", "Hands on your head! Get down!"],
  copStayDown: ["Stay down!", "Don't move, {other}!", "Stay on the ground!", "Don't even think about getting up."],
  copDrop: ["Drop the weapon!", "Put it down, {other}! Now!", "Drop it! Drop it!", "Let go of the weapon, {other}!", "Weapon on the ground! Now!"],
  copDropGun: ["Drop the gun!", "Drop the weapon or I will shoot!", "Gun down, {other}! Now!", "Put it down! Put it down!", "Last chance, {other}! Drop it!"],
  copTaserWarn: ["Taser! Taser!", "Stop or you will be tased!", "Last warning, {other}!", "Stop resisting or I'll tase you!", "Taser! Stand clear!"],
  copStopResisting: ["Stop resisting!", "Stay down, {other}!", "Quit fighting!", "Stop moving! Stop resisting!", "Give me your hands!"],
  copChase: ["Stop! Police!", "Suspect on foot! In pursuit!", "Get back here!", "Stop running, {other}!", "Control, in foot pursuit!"],
  copCuffTased: ["Hands behind your back.", "Don't move. You're being cuffed.", "Easy... cuffs going on.", "Relax. It's over."],
  copCuffing: ["You're under arrest, {other}.", "Hands behind your back.", "Don't make this harder than it is.", "Slowly. Hands behind you."],
  copArrest: [
    "{other}, you're under arrest.", "You have the right to remain silent.", "That's it, you're coming with me.",
    "Anything you say can be used against you.", "You're under arrest for assault.", "You're nicked, {other}.",
  ],
  copRelease: [
    "Alright, {other}. You're free to go. Behave.", "Consider this a warning, {other}.", "Off you go. I don't want to see you again.",
    "Cuffs are off. Don't make me regret it.", "We're done here. Stay out of trouble.",
  ],
  copRadioCustody: ["Control, one in custody.", "Suspect {other} in custody.", "All units, scene is secure.", "Control, I need transport for one."],
  copSuspectDown: ["Suspect down. Control, I need medical.", "{other} is down. Get an ambulance.", "Suspect down! Scene is clear.", "Control... suspect is down."],
  copIdle: ["All quiet here.", "Copy that, control.", "Received.", "Nothing to report.", "Control, say again?", "Checking in. All quiet.", "Ten-four."],
  comply: ["Okay! Okay! I give up!", "Don't shoot!", "I'm not resisting!", "Alright, officer, alright!", "I'm down! I'm down!", "Okay. You got me."],
  cuffed: ["Ow! Not so tight!", "This is so unfair.", "I want a phone call.", "Fine. Fine.", "Is this really necessary?", "You've got the wrong person!"],
  cuffedTalk: [
    "I want a lawyer.", "These are too tight.", "I didn't do anything!", "This is all a misunderstanding.", "Can I at least scratch my nose?",
    "Can someone call my family?", "I'm not saying anything without a lawyer.", "How long do I have to sit here?", "My hands are going numb.", "I've got work in the morning...",
  ],
  uncuffed: ["Finally. My wrists...", "Thanks. I'll behave.", "Oh, thank God.", "I'm never doing that again.", "Can I go home now?"],
  sawArrest: ["{other} cuffed {victim}.", "Huh. {victim}'s been arrested.", "That's {victim} in cuffs.", "They've arrested {victim}.", "Off you go, {victim}."],
  sawArrestMine: ["{victim} got what was coming!", "Thank you, {other}! Lock them up!", "Who's laughing now, {victim}?", "That's for what you did to me, {victim}."],
  sawArrestRelief: ["Good. One less troublemaker.", "Finally. Somebody stopped {victim}.", "Nice work, {other}.", "Phew. We're safe now.", "About time."],
  sawArrestFriend: ["{victim}! No!", "Let them go! They didn't mean it!", "Hang in there, {victim}. I'll sort this out.", "Not {victim}!", "{victim}'s not a bad person!"],

  /* ------------------------------- fire, ice, air ------------------------------ */
  onFire: [
    "I'M ON FIRE!", "IT BURNS! IT BURNS!", "PUT IT OUT! PUT IT OUT!", "AAAAAH! FIRE!", "HELP ME! I'M BURNING!", "Get it off! GET IT OFF!",
    "Water! Somebody get water!", "AAAAAAAAH!", "Help! Help! I'm burning!", "Oh God, oh God, it's on me!",
  ],
  stopDropRoll: ["Stop, drop and roll. Stop, drop and roll.", "Roll! Roll!", "On the ground! Roll!", "Drop and roll, drop and roll...", "Roll it out, roll it out!"],
  rollAdvice: [
    "Stop, drop and roll, {other}!", "{other}! Get on the ground and roll!", "Roll, {other}! Roll!", "Drop! Drop and roll!", "Don't run, {other}! Roll!",
    "Running makes it worse! Roll!",
  ],
  fireOut: ["It's out... it's out...", "Is it out? Tell me it's out.", "I can still smell it...", "Thank you. Thank you...", "My skin...", "Oh God, my arms..."],
  fireOutRolled: ["It worked! It actually worked!", "I rolled it out... I'm alive...", "Out. It's out. Owww...", "Stop, drop and roll. It works.", "It's out. Oh God, it's out."],
  putOutDone: ["It's out, {other}. You're okay.", "There. It's out.", "Got it! You're okay now, {other}.", "Breathe, {other}. It's over.", "Don't move, {other}. You're burned."],
  sawOnFire: [
    "{victim} is on fire!", "Fire! {victim}'s on fire!", "Somebody help {victim}!", "{victim}! You're burning!", "Oh no, {victim}!", "Get water! Anybody!",
    "Get a blanket on {victim}! Don't use your hands!",
  ],
  sawBurningBody: ["{victim}'s body is burning...", "Oh no... {victim}...", "Is that... {victim}?", "Somebody put {victim} out. Please."],
  sawPutOut: ["Phew. {victim}'s out.", "The fire's out!", "{victim} made it!", "Is {victim} okay?", "{victim}'s smoking, but alive."],
  sawBurnDeath: ["{victim} burned to death...", "No... {victim}...", "That smell... oh God, {victim}...", "We couldn't put {victim} out.", "Not like that. Not like that."],
  sawFrozen: [
    "{victim} is frozen solid!", "{victim}? Can you hear me? You're covered in ice!", "Is {victim}... frozen?", "{victim} is covered in ice!",
    "Don't knock {victim} over! They'll break!", "Somebody get a blanket on {victim}!",
  ],
  sawThaw: ["{victim} is thawing out!", "The ice is melting off {victim}!", "{victim}! Hang in there!", "Look! {victim}'s dripping!"],
  sawThawDead: ["The ice is melting... {victim} isn't moving.", "{victim}... too late.", "{victim}'s not waking up."],
  sawIceSnap: ["A piece of {victim} just broke off!", "It snapped off like an icicle!", "{victim} is breaking!", "Careful! Bits of {victim} are coming off!"],
  sawShatter: ["{victim} shattered!", "{victim}'s in pieces!", "No! {victim}!", "It's... it's all over the floor...", "Like glass. {victim} broke like glass."],
  sawFreezeDeath: ["{victim} froze to death...", "{victim}... so cold...", "We were too late for {victim}.", "{victim}'s gone. Frozen."],
  sawChokeDeath: ["{victim} stopped breathing!", "{victim} couldn't breathe...", "No... {victim}!", "{victim}'s lips are blue..."],
  sawHeatDeath: ["{victim} collapsed from the heat!", "It was too hot for {victim}...", "{victim}! Get some water! ...{victim}?"],
  frozenFriend: ["{other}? You're like ice...", "Stay with me, {other}. Somebody warm them up!", "{other} is so cold...", "Can you hear me, {other}?", "Don't you dare die on me, {other}."],
  thawWake: ["So... c-cold...", "Wh-what happened? Why am I wet?", "I was frozen... I was frozen solid.", "I c-can't feel my fingers...", "Everything... hurts..."],
  choking: ["Can't... breathe...", "Let... go...", "Air... please...", "*choking*", "Hkk... hkk...", "St-stop-"],
  gasp: ["*GASP*", "Air! Air!", "*cough* *cough*", "I can breathe... I can breathe...", "*gasping*", "Never... do that... again..."],
  suddenHot: ["Whoa, it's suddenly so hot!", "Is it me, or is it boiling?", "I'm sweating buckets!", "Why am I so hot?!", "Somebody turn the heat down!"],
  suddenCold: ["Brrr! Where did that come from?!", "It's f-freezing!", "Why is it suddenly so cold?", "My t-teeth are chattering!", "Who left the door open? It's freezing!"],
  tooHot: ["I'm burning up...", "So hot... I need water.", "I feel like I'm melting.", "I need some shade.", "I think I'm getting heatstroke."],
  cold: ["B-b-brrr...", "So c-cold...", "Can't st-stop shivering...", "I can't feel my t-toes.", "Anybody got a coat?"],
  breathless: ["Can't... catch my breath...", "*wheeze*", "I need air...", "Hah... hah..."],
  adrenaline: ["My heart's pounding!", "My hands won't stop shaking.", "I can't feel a thing right now.", "Everything's going so fast.", "I'm shaking. Why am I shaking?"],

  /* --------------------------- stuck fast, tied up --------------------------- */
  cantMove: [
    "I can't move!", "Why can't I move?!", "Something's holding me!", "I'm stuck! I'm stuck in the air!", "My arms won't work!",
    "What is this?! Let me go!", "I can't even blink properly.", "Help! I can't move!", "What's happening to me?!",
  ],
  canMove: ["I can move again!", "Whoa! What was that?", "I couldn't move a muscle.", "Never do that to me again.", "I'm free!"],
  tiedUp: ["Untie me!", "Get this off me!", "Who tied me up?!", "Somebody cut me loose!", "Help! I'm tied up!", "These knots are too tight!", "Let me down!"],
  sawTied: ["{victim} is tied up!", "Who did that to {victim}?", "Hang on, {victim}!", "{victim}! What happened?"],
  sawFrozenInPlace: ["{victim}'s just... stopped. In mid-air.", "Why isn't {victim} moving?", "{victim}? Are you okay? You look stuck.", "{victim} can't move! Something's holding them!"],

  /* ------------------------------ walls and trees ----------------------------- */
  glassBreak: ["The glass!", "Whoa! Watch the glass!", "Mind the glass!", "That was a whole window!", "Glass everywhere!"],
  wallDown: ["The wall came down!", "Look out! The wall!", "The wall's gone!", "Who knocked the wall down?", "Is anyone under there?!"],
  timber: ["Timber!", "Tree! Look out!", "It's coming down!", "Who cut the tree down?!", "Watch out! Tree!"],
  wireSnap: ["The rope snapped!", "It broke!", "Whoa! It gave way!", "That rope wasn't strong enough."],

  /* -------------------------------- the gallows -------------------------------- */
  noosed: [
    "Get this rope off my neck!", "No. No, no, no. Not like this.", "What did I do?!", "Somebody help me! Please!",
    "This isn't funny. Take it off!", "I can't get it off!", "Please. I'll do anything.", "Don't touch that lever!", "I don't want to die up here!",
  ],
  sawNoosed: ["Somebody get {victim} down from there!", "{victim}! No!", "This is wrong. This is so wrong.", "Who put {victim} up there?!", "Hold on, {victim}! Don't move!", "Take that rope off {victim}!"],
  sawHanged: ["{victim}!", "Cut the rope! Cut it!", "Lift {victim}! Take the weight off!", "Oh no. Oh no, no, no.", "I can't watch this.", "Somebody do something!"],

  /* ------------------------------- gas, bombs and current ------------------------------- */
  inGas: ["*cough* *cough*", "Gas! I can't breathe!", "My eyes! My eyes are burning!", "Get out of the cloud!", "It burns to breathe! *cough*", "Don't breathe it in!", "*wheeze*", "Which way is out?!"],
  sawGas: ["Gas! Cover your face!", "Get away from that cloud!", "Is that poison?!", "Hold your breath!", "Get upwind!", "Don't walk into that."],
  sawGasDeath: ["The gas got {victim}...", "{victim}'s stopped coughing. That's worse.", "Nobody go near that cloud. Nobody.", "That stuff killed {victim}!"],
  sawLiveGrenade: ["Grenade!", "Get down! Grenade!", "The pin's out! Run!", "Somebody throw that thing away!", "Is that a live grenade?!", "Move, move, move!"],
  sawFuse: ["The fuse is lit!", "That's dynamite! Run!", "Put it out!", "It's fizzing! Get back!", "Everybody back! It's lit!"],
  sawC4: ["Is that... beeping?", "Bomb! That's a bomb!", "Get away from it!", "It's beeping faster!", "That's C4! Get back!"],
  sawMissile: ["Missile!", "Incoming!", "Is that a rocket?!", "Get down!", "Who fired that?!"],
  bombRun: ["Run!", "It's going to blow!", "Get clear! Get clear!", "Too close, too close!", "Faster!"],
  sawElectrocuted: ["{victim}'s being electrocuted!", "Cut the power! Cut the power!", "Don't touch {victim}! You'll get it too!", "Somebody turn that generator off!", "{victim} is smoking!", "Is {victim} touching a live wire?!"],
  nauseous: ["I don't feel so good...", "My stomach...", "Everything's spinning...", "Ugh. I think I'm going to throw up.", "I need to sit down.", "Don't- don't move so fast near me."],
  vomit: ["*retches*", "Oh no- *heaves*", "*vomits*", "Hurk- *BLEGH*", "*heaves*"],
  afterVomit: ["...Better out than in.", "Ugh. Sorry about that.", "I feel a bit better, actually.", "Nobody look at me.", "Water. I need water.", "Oh God. My throat."],
  sawVomit: ["Ugh, gross.", "Oh, that's disgusting.", "Are you okay, {victim}?", "Don't step in it!", "I think I'm going to be sick too...", "Get some air, {victim}."],
  sawShockDeath: ["The current killed {victim}...", "{victim} isn't moving. Is the power still on?!", "Nobody touch {victim}! It could still be live!", "Electrocuted. Oh God."],
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
