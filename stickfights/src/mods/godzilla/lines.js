/* =============================================================================
   GODZILLA - what everybody says about him. He says nothing: he roars.
   ========================================================================== */
import { addLines } from '../../game/lines.js';

addLines({
  // the first sight of him
  seeGodzilla: [
    'What... what IS that?!', "It's as big as a building!", 'GODZILLA!', 'GOJIRA!', 'This is not happening. This is NOT happening.',
    'Oh no. Oh no no no.', 'Run. RUN!', 'Is that a dinosaur?!', 'Everybody get off the street!', "Don't move. Maybe it hasn't seen us.",
    'I thought that was a movie!', 'Look at the size of it...', 'Somebody call the army!',
  ],
  // the roar, heard
  gzRoarHeard: [
    'AAAH! My ears!', 'That sound...!', "It's angry!", 'Cover your ears!', 'The windows! Get down!', 'I can feel it in my chest!',
    "What kind of animal makes a sound like that?", 'Make it stop!',
  ],
  // what they saw him do
  sawGzCrush: [
    'It stepped on {victim}!', '{victim}! NO!', '{victim} is just... gone.', 'Watch its feet! WATCH ITS FEET!', "It didn't even notice {victim}...",
    'Oh god, {victim}...',
  ],
  sawGzEat: [
    'It ATE {victim}!', "It's eating people!", 'It swallowed {victim} whole!', "Don't let it grab you!", '{victim}... it just ate {victim}.',
    'It is hungry. It is HUNGRY!',
  ],
  sawGzGrab: ["It's got {victim}!", 'Put them down!', '{victim}! Hang on!', 'It picked {victim} up like a toy!', 'Let them go!'],
  sawGzThrow: ['It threw {victim}!', '{victim} went flying!', 'It just threw {victim} like a ball!'],
  sawGzBite: ['It bit {victim}!', 'Those teeth...!', '{victim}! It bit {victim}!'],
  sawGzHit: ['{victim}!', 'It hit {victim}!', 'Get away from its tail!', 'Did you see that?!', '{victim} got sent flying!'],
  sawGzBreath: [
    'Its back is glowing!', 'What is that light?!', 'GET DOWN!', "It's breathing fire!", 'Everything is burning!', 'Get behind something!',
    "The light - it's coming out of its mouth!",
  ],
  sawGzBurn: ["{victim}'s on fire!", 'It burned {victim}!', '{victim}! Roll! ROLL!'],
  sawGzWreck: [
    'The building!', "It's tearing the city apart!", 'Get out of the buildings!', "It's all coming down!", 'There were people in there!',
    'Look out above!',
  ],
  gzStomped: ['Whoa- the ground!', 'Earthquake!', 'I can\'t stay on my feet!'],
  // to themselves, with it near
  gzNear: ["It's coming this way!", 'Move! It is heading right for us!', "Don't let it see you!", 'Keep running!', 'Get away from it!'],
  gzShoot: ['Keep firing!', 'Aim for the head!', "It's not even slowing down!", "Bullets don't do anything!", 'Hit it with everything!'],
  // what they say to it
  gzDefy: ["You don't scare me!", 'Come on, then!', 'Over here, you big lizard!', 'This is our city!'],
  // being hurt by it, held by it
  gzHurt: ['AAAAGH!', 'HELP!', 'No-!', 'AAAH!'],
  gzBurned: ['IT BURNS!', 'AAAH! FIRE!', 'Put it out! PUT IT OUT!'],
  gzGrabbed: ['PUT ME DOWN!', 'No no no no no!', 'Somebody help me!', 'Let go of me!', "I don't want to die!", 'HELP!', 'Not the mouth- NOT THE MOUTH!'],
  // Shin Godzilla
  seeShin: [
    'What... is THAT?!', "It's even bigger than the other one!", 'Look at its eyes. There is nothing in them.', "It's cracked all over - like it is burning inside!",
    'Its tail! Something is moving on the end of its tail!', 'That is not an animal. That is a disaster.', 'RUN! Just run!', 'Is it... evolving?',
    'Godzilla...?', "Don't look at it! Don't let it see you!",
  ],
  sawShinGlow: ['Its back is turning purple!', 'Something is coming out of its mouth - GET DOWN!', 'Its jaw - its jaw just SPLIT!', 'The light! Get away from the light!'],
  sawShinBeam: [
    'It cut the building in HALF!', 'Purple light - everywhere!', 'GET DOWN!', 'The whole street is on fire!', "It's slicing through everything!",
    'Nothing can stop that!', 'The buildings! THE BUILDINGS!',
  ],
  sawShinDorsal: ["Lasers! From its BACK!", "They're coming out of its back!", 'Nowhere is safe!', 'The sky is full of light!', 'Everybody down! DOWN!'],
  sawShinTail: ['Its TAIL is firing too!', 'The tail! Watch the tail!', 'Even the end of its tail...!'],
  sawShinBurn: ['{victim}...! The light just went through {victim}!', '{victim} is gone!', 'There is nothing left of {victim}...'],
  shinFrozen: ["It's... frozen. It's frozen solid.", 'It stopped. It just stopped.', 'Is it dead? Or is it waiting?', "Don't go near it. Just... don't.", 'We did it. I think we did it.'],
  // and when it is over
  gzDown: ["It's... down. It's really down.", 'We did it... we actually did it.', 'Is it dead? Tell me it is dead.', 'The monster is dead!', "It's over.", 'Rest now, big guy.'],
});
