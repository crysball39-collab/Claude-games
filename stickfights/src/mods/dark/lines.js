/* =============================================================================
   THINGS IN THE DARK - what everybody says about it. (None of the three
   says anything: the Listener clicks.) Near the Listener, and inside a
   wardrobe, it all comes out as a whisper.
   ========================================================================== */
import { addLines } from '../../game/lines.js';

addLines({
  // the lights going, the first time: nobody knows what it means
  rushLights: [
    "What's wrong with the lights?", 'Did the power just go?', 'Why are the lights doing that?', "Who's messing with the lights?",
    "That's not right...", 'Can anybody else hear that?', 'What is that noise?', "I don't like this.",
  ],
  // ...and once they do
  rushKnow: [
    'The lights! It\'s coming!', "Hide! It's coming through!", 'Get in something - NOW!', 'Not again! Hide!', 'Lights are going! Hide, hide!',
    "It's coming! Get off the floor - get in somewhere!",
  ],
  rushBack: ["It's coming back!", "It's turning round!", "Stay in! It's not over!", 'Again?! Stay down!', "Don't come out! It comes back!"],
  rushNowhere: ["There's nowhere to go...", 'Oh god. Oh god.', 'Please, please, please...', 'Where do I go?!'],
  hideInNow: ['In here! Quick!', 'The wardrobe! Go!', 'Get in! Get in!', 'Make room!', 'In! Shut the doors!'],
  hideInQuiet: ['In here. Quietly.', "Get in. Don't make a sound.", 'Slowly... in here.', 'The wardrobe. Quiet.'],
  inWardrobe: ['Shh...', 'Please, please, please...', "Don't breathe.", "It's right outside.", 'Not a sound.', "Don't move. It'll pass."],
  outWardrobe: ['Is it over?', "I think it's gone.", 'Okay... okay.', 'Never again.', 'Is everybody alright?', "I'm not doing that again."],
  sawRushKill: [
    'It went straight through {victim}!', '{victim}! No!', 'What WAS that?!', 'It took {victim}...', '{victim} was right there, and then...',
    "It just went through them. It didn't even slow down.",
  ],
  rushAfter: ['Is it gone?', 'What the hell was that?', "I can't stop shaking.", 'Nobody go out there yet.', 'It went right past me.', 'Did everybody get inside?'],
  // the Listener
  seeListener: ["What is that?", "It doesn't have a face...", 'Look at its ears...', 'Oh no. Oh no no no.', "Don't. Move.", "It can't see. It can't see us."],
  sawListenerKill: ['It crushed {victim}...', '{victim}... oh god.', 'It heard {victim}. It just... heard them.', 'Quiet. Everybody, quiet.', "It didn't even need to see them."],
  sawListenerHunt: ['It heard {victim}!', 'Run, {victim}!', "It's going for {victim}!", "{victim}, it's coming!"],
  sawWardrobeTorn: ['It tore the doors off!', 'It found {victim}!', 'It heard them in there!', 'Not in there - it can hear you in there!'],
  listenerClicks: ['Do you hear that clicking?', "It's listening...", "Shh. It's listening.", 'That clicking. It finds you with it.'],
});
