/* =============================================================================
   SHALLOW - what it says, and what everybody says about it.

   In a skin it talks like whoever it is wearing (their brain does that),
   except for what slips out under its breath, and the last thing it says
   before it splits. Out of the skin it says very little, slowly, and it
   enjoys all of it.
   ========================================================================== */
import { addLines } from '../../game/lines.js';

/** Its own words, out of the skin (said by species.js, when it wants to). */
export const SHALLOW_LINES = {
  shallowRoar: [
    'AAAAHHH. Much better.', 'There. Room to breathe.', 'You wanted to see me.', 'Do you like it? This is the real one.',
    '{other} was so... small.', 'HHHAAAAAAAA.', 'Look at me.',
  ],
  shallowHunt: [
    'Where are you going, {other}?', 'Run. It helps.', 'I can hear you, {other}.', 'Come here.', "Don't make this take longer.",
    'You started this, {other}.', 'I remember you, {other}.', 'Nowhere to go.',
  ],
  shallowSeize: ['There you are.', 'Got you, {other}.', 'Shhhh.', 'Hold still, {other}.', 'Hello, {other}.', 'Look at me, {other}.'],
  shallowRip: ["Let's see what's inside, {other}.", 'Two of you, now.', 'This will only hurt once.', 'Pull.'],
  shallowEat: ['Hungry.', 'Open wide.', 'Mmmm, {other}.', "You'll be with me always, {other}."],
  shallowAfter: ['Next.', 'Who else?', 'Delicious.', 'Ahh.', 'Who wants to go next?', 'Still hungry.', 'Quiet now.'],
  shallowSeek: ['I need a new face.', 'Something to wear...', 'Which one of you fits?', 'So cold out here.', 'Hold still. I am choosing.'],
  shallowPick: ["You'll do, {other}.", 'Your size, {other}.', "I'll take good care of you, {other}. From the inside.", 'Turn around, {other}.', 'Such a nice skin, {other}.'],
  shallowEnter: ['Mine now.', 'It fits.', 'Shhh. In we go.', 'Nobody will ever know.'],
  shallowHurt: ['That tickles, {other}.', "You're next, {other}.", 'Oh, brave.', 'Again. Do it again.', 'You will regret that, {other}.'],
};

// what everybody else says about it: and what it mutters, wearing somebody
addLines({
  // muttered under its breath, in a skin
  shallowWhisper: [
    '...fits...', 'Smile. Like they do.', 'Breathe in. Breathe out. Like they do.', 'I am {me}. I have always been {me}.',
    'Nobody is looking.', 'So many skins here.', 'Hungry...', 'Blink. Remember to blink.', '*hums, slightly wrong*',
  ],
  // as it splits
  shallowSplitting: [
    "You shouldn't have done that.", 'Now look what you made me do.', 'I liked this skin.', 'Oh no. Not again.',
    "It's too small. It was always too small.", 'Ssssssss...', 'Stop. Stop. STOP.',
  ],
  sawShallowTwitch: ["Did {other}'s face just... move?", 'Is {other} okay? That looked wrong.', 'Your neck did a weird thing, {other}.', '...{other}?'],
  sawShallowCrack: [
    "What's wrong with {other}?!", "{other}? {other}, you're cracking!", "{other}'s face is coming off!", 'Something is coming out of {other}!',
    'Stay back from {other}!', 'Oh no. Oh no no no.',
  ],
  sawShallowOut: [
    'WHAT IS THAT?!', 'It came out of {victim}!', "{victim} wasn't real!", 'It was wearing {victim}!', "It's so tall...",
    'RUN!', 'Look at its teeth!', 'Those claws!', 'That was never {victim}!',
  ],
  seeShallow: ['What... is that?', "Don't look at it. Don't look at it.", 'Look at its smile...', 'Its eyes... just the pupils...', 'RUN!', 'Get away from it!'],
  sawShallowRip: ['It tore {victim} in HALF!', '{victim}! NO!', 'It ripped {victim} apart!', 'Both halves... oh god...', "I'm going to be sick."],
  sawShallowEat: ["It's EATING {victim}!", 'It bit {victim}... it bit their head off!', '{victim}! It ate {victim}!', 'It swallowed {victim} whole!', "Don't let it eat me!"],
  sawShallowHollow: [
    "It's cutting {victim} open!", 'What is it doing to {victim}?!', "It's pulling {victim}'s bones out!", "{victim}'s skeleton... it took out the skeleton!",
    'Their insides... it is throwing their insides!', 'Put {victim} down!',
  ],
  sawShallowTake: [
    "It went INSIDE {victim}!", "That's not {victim} any more!", "Don't go near {victim}! It's wearing them!", '{victim} just got up. {victim} should not get up.',
    "It's wearing {victim}'s skin!", "That thing is {victim} now!",
  ],
  knowsShallow: [
    "Stay away from {other}! That's not really them!", "Don't trust {other}. I saw what happened.", "{other}, I know what you are.",
    "Everybody get away from {other}!", "That's not {other}. That's the thing.", "{other} is smiling wrong.",
  ],
  sawShallowRegrow: ['It grew BACK!', "It's growing a new one!", 'That should have stopped it!', 'Nothing hurts it!'],
  shallowDead: ["Is it... dead?", 'It\'s melting!', "It's gone. It's really gone.", 'Did we kill it?', 'Where did it go?!'],
});
