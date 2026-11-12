/* Who someone is: what they look like, what they are called, what they are like. */
import { pick, rand, chance } from '../core/util.js';

const SKIN = [0xf1c9a5, 0xe4b48a, 0xd09a6a, 0xb07c4c, 0x8a5a32, 0x5f3d22];
const HAIR = [
  [0x1b1512, 'black'], [0x33241a, 'dark'], [0x6a4a2e, 'brown'], [0xc2a05c, 'blonde'], [0x8f4322, 'red'], [0x8d8d8d, 'grey'], [0xd9d9d6, 'white'],
];
const EYES = ['#3b2a1e', '#5a3d24', '#4a6a8a', '#3f6b4f', '#6b6f73', '#2a2019'];
const TOPS = [
  [0xa83232, 'red'], [0x2f4f8f, 'blue'], [0x3a6b45, 'green'], [0xc9a227, 'yellow'], [0x1e1f22, 'black'], [0xd9d9d4, 'white'],
  [0x74787d, 'grey'], [0xc8682a, 'orange'], [0x6a3f8a, 'purple'], [0xc76b8f, 'pink'], [0x6b4a32, 'brown'], [0x2f7f85, 'teal'],
  [0x25304f, 'navy'], [0x5d6337, 'olive'], [0x6e2433, 'maroon'],
];
const GARMENT_LONG = ['jacket', 'hoodie', 'coat', 'sweater', 'shirt'];
const GARMENT_SHORT = ['t-shirt', 'polo shirt', 'top'];
const BOTTOMS = [
  [0x34466b, 'blue jeans'], [0x202226, 'black trousers'], [0x55585e, 'grey trousers'], [0x9a8a66, 'khakis'],
  [0x4f3d2c, 'brown trousers'], [0x2b3a55, 'dark jeans'], [0x5d6337, 'olive trousers'],
];
const SHORTS = [[0x34466b, 'denim shorts'], [0x202226, 'black shorts'], [0x9a8a66, 'khaki shorts'], [0x6e2433, 'red shorts']];
const SHOES = [0x1a1a1c, 0x3a2a1e, 0xd0d0cc, 0x6b2020, 0x2a3550, 0x4a4a4e];

const NAMES_M = ['Marcus', 'Daniel', 'Tom', 'Rafael', 'Kenji', 'Luis', 'Andre', 'Peter', 'Omar', 'Jamal', 'Viktor', 'Sean', 'Hugo', 'Amir', 'Dmitri',
  'Felix', 'Noah', 'Ethan', 'Carlos', 'Wei', 'Arjun', 'Jonas', 'Mateo', 'Theo', 'Kofi', 'Sam', 'Leon', 'Ivan', 'Tariq', 'Greg', 'Paul', 'Dennis',
  'Walt', 'Rui', 'Emeka', 'Yusuf', 'Aldo', 'Bram', 'Colm', 'Darius'];
const NAMES_F = ['Elena', 'Maya', 'Sofia', 'Aisha', 'Hannah', 'Priya', 'Chloe', 'Nadia', 'Rosa', 'Mei', 'Ingrid', 'Zoe', 'Lena', 'Amara', 'Julia',
  'Fatima', 'Nora', 'Clara', 'Yuki', 'Isabel', 'Tess', 'Dana', 'Carmen', 'Ruth', 'Leila', 'Anya', 'Greta', 'Paula', 'Simone', 'Ines', 'Joan', 'Beth',
  'Kira', 'Mona', 'Abena', 'Sunita', 'Vera', 'Wren', 'Odile', 'Halima'];
const SURNAMES = 'ABCDEFGHJKLMNOPRSTVW';

const JOBS = ['nurse', 'bus driver', 'student', 'accountant', 'line cook', 'electrician', 'teacher', 'courier', 'barista', 'retired postal worker',
  'software tester', 'shop assistant', 'plumber', 'receptionist', 'night security guard', 'dental hygienist', 'bike mechanic', 'librarian',
  'taxi dispatcher', 'unemployed, between jobs', 'paramedic off shift', 'law clerk', 'florist', 'warehouse picker', 'street musician'];
const ERRANDS = ['walking home from work', 'on the way to buy bread', 'killing time before a train', 'late for a shift', 'out for some air',
  'looking for a pharmacy', 'heading to meet a friend', 'walking off an argument', 'on a lunch break', 'trying to find a cash machine',
  'coming back from the dentist', 'wandering with nowhere to be', 'delivering a parcel', 'on the way to a job interview'];
const QUIRKS = ['talks to themselves when nervous', 'swears a lot', 'is unfailingly polite even when terrified', 'makes dark jokes under stress',
  'prays under their breath', 'narrates what is happening as if nobody else can see it', 'cannot stop asking questions', 'goes very quiet when scared',
  'threatens to call the police constantly', 'apologises for everything', 'is convinced this is being filmed', 'bargains with everyone',
  'thinks of their dog at home', 'counts things to stay calm', 'is furious about how their day is going', 'worries about being late above all else'];

function darker(hex, k) {
  const r = Math.round(((hex >> 16) & 255) * k), g = Math.round(((hex >> 8) & 255) * k), b = Math.round((hex & 255) * k);
  return `rgb(${r},${g},${b})`;
}

/** A random stranger. */
export function randomLook() {
  const sex = chance(0.5) ? 'f' : 'm';
  const f = sex === 'f';
  const skin = pick(SKIN);
  const age = Math.round(rand(19, 68));
  let [hair, hairName] = pick(HAIR.slice(0, 5));
  if (age > 52 && chance(0.6)) [hair, hairName] = pick(HAIR.slice(5));
  const styles = f ? ['long', 'long', 'ponytail', 'medium', 'short', 'beanie', 'bun'] : ['short', 'short', 'medium', 'bald', 'cap', 'beanie', 'short'];
  const style = pick(styles);
  const longSleeve = chance(0.68);
  const [top, topName] = pick(TOPS);
  const garment = pick(longSleeve ? GARMENT_LONG : GARMENT_SHORT);
  const shorts = !longSleeve && chance(0.4);
  const [pants, pantsName] = pick(shorts ? SHORTS : BOTTOMS);
  const scale = f ? rand(0.855, 0.925) : rand(0.895, 0.975);
  const build = rand(0.92, 1.12) * (f ? 0.95 : 1.02);
  const hat = style === 'beanie' || style === 'cap' ? pick(TOPS)[0] : 0;
  const first = pick(f ? NAMES_F : NAMES_M);
  return {
    sex, age, name: first + ' ' + pick(SURNAMES.split('')) + '.', first,
    scale, build, skin, hair, hairName, style, hat,
    top, pants, shoes: pick(SHOES), longSleeve, shorts,
    eye: pick(EYES), brow: darker(hair, 0.7), browW: f ? 2.2 : 3, lip: f ? darker(0xb05a5a, 1) : darker(skin, 0.62),
    skinShade: darker(skin, 0.72), stubble: !f && chance(0.3),
    noun: f ? 'woman' : 'man',
    wears: topName + ' ' + garment,
    desc: `a ${f ? 'woman' : 'man'} in ${/^[aeiou]/.test(topName) ? 'an' : 'a'} ${topName} ${garment}`,
    outfit: `${topName} ${garment} and ${pantsName}`,
    pitch: f ? rand(1.15, 1.6) : rand(0.7, 1.05),
    mass: (f ? 62 : 78) * build * Math.pow(scale / 0.92, 3),
    persona: {
      job: pick(JOBS), errand: pick(ERRANDS), quirk: pick(QUIRKS),
      bravery: rand(0.05, 0.95), temper: rand(0.05, 0.95), empathy: rand(0.1, 1), cheer: rand(0.1, 0.95),
      jumpy: rand(0.1, 1), patience: rand(0.1, 0.95), squeamish: rand(0, 1), chatty: rand(0.15, 1),
    },
  };
}

/** You. */
export function playerLook() {
  return {
    sex: 'm', age: 30, name: 'You', first: 'You', scale: 0.94, build: 1.02, skin: 0xd9a676, hair: 0x241a14, hairName: 'dark', style: 'short', hat: 0,
    top: 0x23252a, pants: 0x2b3345, shoes: 0x141416, longSleeve: true, shorts: false,
    eye: '#3b2a1e', brow: 'rgb(26,18,14)', browW: 3, lip: 'rgb(150,100,80)', skinShade: 'rgb(150,112,80)', stubble: true,
    noun: 'man', wears: 'black hoodie', desc: 'a man in a black hoodie', outfit: 'black hoodie and dark jeans', pitch: 0.9, mass: 80,
    persona: { job: '', errand: '', quirk: '', bravery: 1, temper: 0.5, empathy: 0.5, cheer: 0.5, jumpy: 0, patience: 1, squeamish: 0, chatty: 0 },
  };
}
