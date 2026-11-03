/* =============================================================================
   GODZILLA - what everybody says about him. He says nothing: he roars.
   (Said the way people would: in plain words, mostly screamed.)
   ========================================================================== */
import { addLines } from '../../game/lines.js';

addLines({
  // the first sight of him
  seeGodzilla: [
    "What... what is that?!", "It's the size of a building!", "Godzilla!", "Gojira!", "This isn't happening. This isn't happening.",
    "Oh no. Oh no no no.", "Run. Run!", "Is that a dinosaur?!", "Everybody get off the street!", "Don't move. Maybe it hasn't seen us.",
    "I thought that was just in films!", "Look at the size of it...", "Somebody call the army!", "Oh my God. Oh my God, it's real.",
  ],
  // the roar, heard
  gzRoarHeard: [
    "Agh! My ears!", "What is that noise?!", "It's angry!", "Cover your ears!", "The windows! Get down!", "I can feel it in my chest!",
    "What makes a sound like that?", "Make it stop!",
  ],
  // what they saw him do
  sawGzCrush: [
    "It stepped on {victim}!", "{victim}! No!", "{victim}'s just... gone.", "Watch its feet! Watch its feet!", "It didn't even notice {victim}...",
    "Oh God, {victim}...",
  ],
  sawGzEat: [
    "It ate {victim}!", "It's eating people!", "It swallowed {victim} whole!", "Don't let it grab you!", "{victim}... it just ate {victim}.",
    "It's hungry. Oh God, it's hungry.",
  ],
  sawGzGrab: ["It's got {victim}!", "Put them down!", "{victim}! Hang on!", "It picked {victim} up like a toy!", "Let them go!"],
  sawGzThrow: ["It threw {victim}!", "{victim} went flying!", "It just threw {victim} like it was nothing!"],
  sawGzBite: ["It bit {victim}!", "Look at those teeth...", "{victim}! It bit {victim}!"],
  sawGzHit: ["{victim}!", "It hit {victim}!", "Get away from its tail!", "Did you see that?!", "{victim} got sent flying!"],
  sawGzBreath: [
    "Its back is glowing!", "What's that light?!", "Get down!", "It's breathing fire!", "Everything's burning!", "Get behind something!",
    "The light- it's coming out of its mouth!",
  ],
  sawGzBurn: ["{victim}'s on fire!", "It burned {victim}!", "{victim}! Roll! Roll!"],
  sawGzWreck: [
    "The building!", "It's tearing the city apart!", "Get out of the buildings!", "It's all coming down!", "There were people in there!",
    "Look out above!",
  ],
  gzStomped: ["Whoa- the ground!", "Earthquake!", "I can't stay on my feet!"],
  // to themselves, with it near
  gzNear: ["It's coming this way!", "Move! It's heading right for us!", "Don't let it see you!", "Keep running!", "Get away from it!"],
  gzShoot: ["Keep firing!", "Aim for the head!", "It's not even slowing down!", "Bullets aren't doing anything!", "Hit it with everything!"],
  // what they say to it
  gzDefy: ["You don't scare me!", "Come on, then!", "Over here! Over here!", "This is our city!"],
  // being hurt by it, held by it
  gzHurt: ["AAAAGH!", "Help!", "No-!", "AAAH!"],
  gzBurned: ["It burns!", "AAAH! Fire!", "Put it out! Put it out!"],
  gzGrabbed: ["Put me down!", "No no no no no!", "Somebody help me!", "Let go of me!", "I don't want to die!", "Help!", "Not the mouth- not the mouth!"],
  // Shin Godzilla
  seeShin: [
    "What... is that?!", "It's even bigger than the other one!", "Look at its eyes. There's nothing in them.", "It's cracked all over- like it's burning inside!",
    "Its tail! Something's moving on the end of its tail!", "That's not an animal. That's a disaster.", "Run! Just run!", "Is it... changing?",
    "Is that Godzilla?", "Don't look at it! Don't let it see you!",
  ],
  sawShinGlow: ["Its back's turning purple!", "Something's coming out of its mouth- get down!", "Its jaw- its jaw just split open!", "The light! Get away from the light!"],
  sawShinBeam: [
    "It cut the building in half!", "That light- it's everywhere!", "Get down!", "The whole street's on fire!", "It's cutting through everything!",
    "Nothing can stop that!", "The buildings! Oh God, the buildings!",
  ],
  sawShinDorsal: ["Beams! From its back!", "They're coming out of its back!", "Nowhere's safe!", "The sky's full of light!", "Everybody down! Down!"],
  sawShinTail: ["Its tail's firing too!", "The tail! Watch the tail!", "Even the end of its tail...!"],
  sawShinBurn: ["{victim}...! The light went right through {victim}!", "{victim}'s gone!", "There's nothing left of {victim}..."],
  // its second form, crawling up the street; its third, up on two legs
  seeShin2: [
    "What is that thing?!", "Its eyes... look at its eyes!", "It's crawling up the street!", "Is that a fish? Is that a giant fish?!",
    "It's dragging itself along on its belly!", "Something came up out of the water!", "Don't let it crawl over you!", "What are those slits on its neck?",
  ],
  seeShin3: ["It's standing up!", "It's walking on two legs now!", "That's not the same thing- it's red now!", "It keeps changing!", "Why is it getting bigger?!"],
  sawShinGills: ["Its gills! What's pouring out of them?!", "It's bleeding everywhere!", "The whole street's red!", "Don't touch that stuff!", "Is it hurt? Is that blood?"],
  sawShinChange: ["It's... steaming?!", "What's happening to it?!", "It's changing!", "Get back! Get back from the steam!", "Something's happening to it- run!"],
  sawShinStand: ["It stood up!", "On two legs- it stood up!", "It's... bigger. It's getting bigger.", "It's turned into something else!"],
  sawShinGrown: ["It grew- it actually grew!", "Look how big it is now...", "It's not stopping. It's never going to stop.", "That's not the same monster anymore.", "Oh no. Oh no, it's huge."],
  // the breath, coming
  sawShinSmog: ["Black smoke! It's breathing out smoke!", "Get away from the smoke!", "Cover your mouth!", "I can't see anything!", "The smoke's coming this way!"],
  sawShinFire: ["The smoke's on fire!", "Fire! It's all on fire!", "Run from the flames!", "The whole street's burning!", "It caught- everything caught!"],
  sawShinBuild: ["The fire... it's turning purple!", "It's building up to something!", "Something worse is coming- get down!", "Its back's blazing!", "The light's getting brighter!"],
  inSmog: ["*cough* *cough*", "Can't... breathe...", "*coughing*", "The smoke- *cough*", "I can't see!", "*wheeze*", "Get out of the smoke!"],
  shinFrozen: ["It's... frozen. It's frozen solid.", "It stopped. It just stopped.", "Is it dead? Or is it waiting?", "Don't go near it. Just... don't.", "We did it. I think we did it."],
  // and when it is over
  gzDown: ["It's... down. It's really down.", "We did it... we actually did it.", "Is it dead? Tell me it's dead.", "It's dead! It's dead!", "It's over.", "Is it over? Is it really over?"],
});
