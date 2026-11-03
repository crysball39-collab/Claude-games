/* =============================================================================
   SUPERPOWERS - what people say about them: whoever has one, finding out;
   whoever is on the end of one; and everybody watching, who cannot believe
   what they are seeing. Written the way the rest is (game/lines.js): the way
   people would really say it. {other} is who they say it to or about.
   ========================================================================== */
import { LINES } from '../lines.js';

Object.assign(LINES, {
  /* --------------------------- getting one, losing it --------------------------- */
  gotFlight: ["Whoa- my feet. My feet aren't touching the ground.", "I'm floating. Why am I floating?", "I feel so light...", "Okay. Okay. Don't panic. I think I can fly.", "Something's different. I feel like I could just... go up."],
  gotStrength: ["My hands are buzzing.", "I feel strong. Really strong.", "What's happening to my arms?", "I could lift a car right now. I'm sure of it.", "Everything feels... light. Like it's made of paper."],
  gotSpeed: ["Why is everyone moving so slowly?", "My heart's going a mile a minute.", "Everything's slowed down. Or is it me?", "I can't stand still. I need to move.", "Did time just slow down?"],
  gotTK: ["I can feel everything in the room.", "My head's humming...", "Did that just move? Did I do that?", "There's something in my head. Pulling at things.", "I feel like I could move things just by looking at them."],
  lostFlight: ["It's gone. I'm heavy again.", "The ground feels... normal.", "I can't feel it any more. The lightness.", "Back to walking, then."],
  lostStrength: ["My arms feel normal again.", "It's gone. I'm just me.", "Huh. Everything's heavy again.", "Was any of that real?"],
  lostSpeed: ["Everything's back to normal speed.", "Whoa. I feel slow.", "It's gone. I'm out of breath.", "Everything's caught up with me."],
  lostTK: ["It's quiet in my head now.", "I can't feel anything pulling.", "It's gone. Everything's just... stuff again.", "My head's clear. It's gone."],
  flyJoy: ["Look at me! I'm flying!", "This is incredible.", "I could get used to this.", "Wheee- sorry. I had to.", "The view from up here..."],

  /* ----------------------------------- flight ----------------------------------- */
  pwSkyToss: ["Going up.", "Hold on to something. Oh wait, you can't.", "Let's take this upstairs.", "You're coming with me.", "Hope you like heights."],
  pwWallPin: ["Over here.", "Against the wall. Now.", "You're not going anywhere.", "Let's find a wall.", "Hold still."],
  pwKickSlam: ["Up you go!", "And down you come!", "Up- and down!", "Kick, and- slam!"],
  pwDiveBomb: ["Incoming!", "Look up.", "Heads up!", "Watch the sky."],
  pwTackle: ["Coming through!", "Clear the way!", "You're coming with me!", "Brace yourself."],
  pwJuggle: ["Up!", "Keep up!", "Not done yet!", "One, two- and away."],
  pwSpinThrow: ["Round and round you go.", "Hope you don't get dizzy.", "And... let go.", "Spin cycle."],
  pwSkyDrop: ["Let's go for a little flight.", "How high do you think we are now?", "Higher.", "You wanted a fight. Here's a fall."],
  pwSkyDropLet: ["Bye.", "Oops.", "Should've been nicer to me.", "Hope you can fly too."],
  pwFlyBy: ["Coming through!", "Excuse me!", "Watch out!", "Fly-by."],
  pwAirlift: ["I've got you. Hold on.", "Grab on. We're getting out of here.", "Up you come. You're safe now.", "Don't look down."],

  /* ---------------------------------- strength ---------------------------------- */
  pwMegaPunch: ["This is going to hurt.", "Hold still.", "One punch.", "I've been saving this one."],
  pwGroundPound: ["Everybody down!", "Hold on to something!", "Get off your feet!", "Brace!"],
  pwHeave: ["Catch!", "Think fast!", "Here, take this!", "This is heavy. For you."],
  pwOverheadToss: ["Up you go.", "You weigh nothing.", "Out you go.", "Off you pop."],
  pwBearHug: ["Come here.", "Let's hug it out.", "Hug?", "You're not going anywhere."],
  pwLauncher: ["Up!", "See you up there.", "Fly.", "Lift-off."],
  pwThunderClap: ["Cover your ears.", "Hope your ears are okay.", "Listen to this.", "Clap."],
  pwQuakeStomp: ["Feel that?", "Hold your ground. If you can.", "Shake it off.", "Stomp."],
  pwWallBreaker: ["Who needs doors?", "Through it is.", "Shortcut.", "Nothing's stopping me."],
  pwLiftSlam: ["Up- and down!", "Say goodnight.", "Down you go.", "Floor's this way."],

  /* ------------------------------------ speed ------------------------------------ */
  pwBlitz: ["Too slow.", "Keep up!", "Can you even see me?", "Blink and you'll miss it."],
  pwBlink: ["Behind you.", "Over here.", "Missed me.", "Turn around."],
  pwWhirlwind: ["Round and round.", "Hold on to your hat.", "Windy, isn't it?", "Try standing up in this."],
  pwDodge: ["Missed.", "Nope.", "Too slow.", "Not there."],
  pwSnatch: ["I'll take that.", "Thanks, I'll have that.", "Looking for this?", "You won't be needing that."],
  pwGustPunch: ["Feel the breeze?", "I don't even need to touch you.", "Bit windy.", "Wind."],
  pwDropkick: ["Here I come!", "Both feet!", "Heads up!", "Incoming!"],
  pwKickStorm: ["Keep up!", "Can you count them?", "Left, right, left, right-", "How many was that?"],
  pwRescueDash: ["I've got you!", "Let's go, now!", "Out of here!", "Hold on, this'll be quick."],
  pwLightningLine: ["Excuse me!", "Coming through!", "Make way!", "Straight through."],

  /* ---------------------------------- telekinesis ---------------------------------- */
  pwTkLift: ["Up.", "Stay there.", "Look at you, floating.", "Hang in there."],
  pwTkThrow: ["Out.", "Off you go.", "Get out of my sight.", "Away with you."],
  pwTkPush: ["Back!", "Get back!", "Stay away from me!", "Away!"],
  pwTkPull: ["Come here.", "Get over here.", "Not so fast.", "You're coming to me."],
  pwTkChoke: ["Quiet.", "Shh.", "Not another word.", "Breathe if you can."],
  pwTkBarrage: ["Look out.", "Incoming.", "Everything must go.", "Duck."],
  pwTkDisarm: ["I'll take that.", "Drop it. Oh, you already have.", "You won't be needing that.", "Mine now."],
  pwTkBulletStop: ["Go on, then. Shoot.", "Not today.", "Try it.", "Stop."],
  pwTkSlam: ["Down. And again.", "Stay down.", "Up, and down.", "You should've stayed down."],
  pwTkFloat: ["Huh. I can do this too.", "Look, no hands.", "I'm floating.", "This is strange."],

  /* ------------------------------- on the end of it ------------------------------- */
  pwCarriedUp: ["Put me down! Put me down!", "We're too high! We're too high!", "No, no, no- don't let go!", "What are you doing?!", "Let me go! Wait, no, don't!", "I'm going to be sick, put me down!", "Don't drop me! Please don't drop me!"],
  pwPinned: ["Get off me!", "I can't move!", "Let go of me!", "Agh- my back!"],
  pwSpun: ["Stop! Stop spinning!", "I'm going to be sick!", "Let go of my leg!", "Aaaah!"],
  pwLiftedUp: ["Put me down!", "Whoa- whoa- put me down!", "How are you even lifting me?!", "Let go!"],
  pwCrushed: ["Can't- breathe-", "My ribs- you're crushing me-", "Let go- please-", "Agh! Stop!"],
  pwSnatched: ["Hey! Where did it go?!", "What- my gun!", "How did you-", "Give that back!"],
  pwLifted: ["What's happening?!", "I'm floating- why am I floating?!", "Put me down! Whatever you are!", "Something's got me!", "I can't touch the ground!", "Let me down! I can't breathe!"],
  pwYanked: ["Whoa!", "What's pulling me?!", "Agh!", "Something's dragging me!"],
  pwRescued: ["Thank you...", "Oh, thank God.", "Get me out of here.", "You came for me."],
  pwDodged: ["Missed.", "Too slow.", "Over here.", "Not even close."],

  /* --------------------------------- watching it --------------------------------- */
  sawFlying: ["They're flying. They're actually flying.", "Are you seeing this?!", "How is {other} doing that?!", "{other} can fly?!", "That's not possible. People can't fly.", "Somebody tell me I'm dreaming.", "{other}, how are you up there?!", "No way. No way."],
  sawSkyToss: ["They threw {victim} out of the sky!", "Oh God, {victim}!", "{victim}! Did you see how high that was?!", "Nobody survives a fall like that."],
  sawSuperBlow: ["Did {other} just punch {victim} across the room?!", "How hard did they hit {victim}?!", "{victim} went flying!", "No person hits that hard.", "Oh my God. {victim}.", "{victim} went straight across the room!", "That punch- that wasn't human."],
  sawSlam: ["{other} slammed {victim} into the ground!", "{victim}! Oh God, the floor cracked!", "That's going to break something.", "Did you hear that?!", "{victim}'s not getting up from that."],
  sawSpeedBlow: ["I didn't even see them move!", "How fast is {other}?!", "{victim} got hit like ten times!", "I can't even see their hands!"],
  sawCrush: ["{other}'s crushing {victim}!", "Let {victim} go! You'll kill them!", "I can hear their ribs going...", "Stop! You're killing them!"],
  sawTelekinesis: ["{other} didn't even touch them!", "What's lifting {victim}?!", "How is {other} doing that?!", "Nobody's touching {victim}!", "It's like something invisible has got them.", "{other} just looked at them and- and they flew!", "They're doing it with their mind!", "Don't let {other} look at you!"],
  sawShockwave: ["Get down!", "What was that?! The ground just-", "I can't stay on my feet!", "Everyone's going over!", "The floor! Did the floor just move?!", "My ears- what was that?!"],
  sawSpeedster: ["Where did they go?!", "Was that a person?!", "Did you see how fast {other} was?!", "They're everywhere at once!", "I can't even see {other}!", "{other}'s just a blur!"],
  sawBulletStop: ["The bullets stopped! In the air!", "They're just... hanging there.", "How did {other} stop them?!", "That's impossible."],
  sawWallSmash: ["They went straight through the wall!", "The wall! There's a hole in the wall!", "Did {other} just run through that?!", "Who does that?!"],
  sawGotPower: ["Did you see that? Something happened to {other}.", "{other}? Are you okay? You look different.", "Why is {other} glowing?", "What just happened to {other}?"],
});
