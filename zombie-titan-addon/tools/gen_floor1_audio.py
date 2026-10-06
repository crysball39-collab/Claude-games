"""Synthesizes the Hotel's (Floor 1) audio, written to the resource pack's sounds/zt/:

  elevator_music.ogg   an original lounge tune for the elevator rides (112 BPM, C major:
                       a vibraphone melody over electric piano, bossa bass and brushes)
  door100_chase.ogg    an original, seamlessly looping chase for the Figure's last hunt
                       (150 BPM, E minor, with a flat second for dread)
  psst.ogg             Screech's whisper from the dark
  rush_approach.ogg    Rush coming: seven seconds of rumble, roar and static that start almost
                       silent and swell until it bursts in
  rush_pass.ogg        Rush tearing past: a roar that peaks and falls away (its pitch dropping)

Nothing is sampled; every sound is made here from sines, saws and noise. The OGGs are encoded
with ffmpeg (libvorbis) in bit-exact mode, so the same script always produces the same files.

    python3 tools/gen_floor1_audio.py
"""
import os
import shutil
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from gen_doors_audio import SR, env, hat, kick, lowpass, note, saw, snare, square  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "packs", "ZombieTitan_RP", "sounds", "zt")


class Loop:
    """A buffer `length` seconds long; whatever runs past its end wraps round to the start."""

    def __init__(self, length):
        self.n = int(round(length * SR))
        self.buf = np.zeros(self.n)

    def add(self, start, wave):
        i = int(round(start * SR)) % self.n
        k = 0
        while k < len(wave):
            m = min(len(wave) - k, self.n - i)
            self.buf[i:i + m] += wave[k:k + m]
            k += m
            i = 0


def encode(samples, name, peak=0.66):
    mix = samples - samples.mean()
    mix = mix / (np.max(np.abs(mix)) / peak)
    pcm = (mix * 32767).astype("<i2").tobytes()
    path = os.path.join(OUT, name + ".ogg")
    os.makedirs(OUT, exist_ok=True)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        if os.path.exists(path):
            print("ffmpeg not found; keeping the existing", os.path.relpath(path, ROOT))
            return
        sys.exit("ffmpeg is needed to encode " + name)
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
                    "-c:a", "libvorbis", "-q:a", "2", "-fflags", "+bitexact", "-flags:a", "+bitexact",
                    "-map_metadata", "-1", path], input=pcm, check=True)
    print("%s written: %.1f s, %d KB" % (name, len(samples) / SR, os.path.getsize(path) // 1024))


def tone(f, dur):
    t = np.arange(int(dur * SR)) / SR
    return t, 2 * np.pi * f * t


# =============================================================================================
# the elevator's music
# =============================================================================================
def epiano(f, dur):
    """An electric piano: a sine frequency-modulated by its own pitch, the bell fading fast."""
    t, ph = tone(f, dur)
    index = 1.6 * np.exp(-t * 7) + 0.25
    w = np.sin(ph + index * np.sin(ph)) * (1 + 0.15 * np.sin(2 * np.pi * 5.5 * t))
    return w * env(len(t), 0.004, 0.9, 0.25, release=0.08)


def vibes(f, dur):
    """A vibraphone: sine and a quiet fourth harmonic, with the motor's tremolo."""
    t, ph = tone(f, dur)
    w = np.sin(ph) + 0.18 * np.sin(4 * ph) * np.exp(-t * 12)
    return w * (1 + 0.3 * np.sin(2 * np.pi * 6 * t)) * env(len(t), 0.003, 0.7, 0.0, release=0.06)


def pluck_bass(f, dur):
    t, ph = tone(f, dur)
    w = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph)
    return w * env(len(t), 0.006, 0.45, 0.2, release=0.05)


def brush(rng, dur=0.12, gain=1.0):
    t = np.arange(int(dur * SR)) / SR
    n = rng.standard_normal(len(t))
    n = n - lowpass(n, 3500)
    return n * np.exp(-t * 32) * 0.16 * gain


def rim(rng):
    t = np.arange(int(0.05 * SR)) / SR
    return (np.sin(2 * np.pi * 1700 * t) * 0.5 + rng.standard_normal(len(t)) * 0.3) * np.exp(-t * 90) * 0.35


def elevator_music():
    bpm = 112.0
    beat = 60.0 / bpm
    bars = 8
    loop = Loop(bars * 4 * beat)
    piano, bass, drums, mel = Loop(loop.n / SR), Loop(loop.n / SR), Loop(loop.n / SR), Loop(loop.n / SR)
    rng = np.random.default_rng(5150)
    # one chord a bar (two in the turnarounds): (beat, root, chord tones)
    chords = [
        [(0, "C2", ["E3", "G3", "B3", "D4"])],
        [(0, "A1", ["G3", "C4", "E4"])],
        [(0, "D2", ["F3", "A3", "C4", "E4"])],
        [(0, "G1", ["F3", "B3", "D4"])],
        [(0, "E2", ["G3", "B3", "D4"])],
        [(0, "A1", ["G3", "C#4", "E4"])],
        [(0, "D2", ["F3", "A3", "C4"]), (2, "G1", ["F3", "B3", "E4"])],
        [(0, "C2", ["E3", "G3", "B3"]), (2, "G1", ["F3", "B3", "D4"])],
    ]
    melody = [
        [(0, "E5", 1), (1, "G5", 1), (2, "B5", 1.5), (3.5, "A5", 0.5)],
        [(0, "G5", 1.5), (1.5, "E5", 0.5), (2, "C5", 2)],
        [(0, "F5", 1), (1, "A5", 1), (2, "C6", 1.5), (3.5, "B5", 0.5)],
        [(0, "A5", 1.5), (1.5, "G5", 0.5), (2, "F5", 1), (3, "D5", 1)],
        [(0, "E5", 1), (1, "G5", 1), (2, "B5", 1), (3, "D6", 1)],
        [(0, "C#6", 1.5), (1.5, "B5", 0.5), (2, "A5", 1), (3, "G5", 1)],
        [(0, "F5", 1), (1, "A5", 1), (2, "G5", 1), (3, "F5", 1)],
        [(0, "E5", 2), (2, "D5", 1), (3, "G4", 1)],
    ]
    for bar in range(bars):
        t0 = bar * 4 * beat
        segs = chords[bar]
        for i, (b0, root, tones) in enumerate(segs):
            b1 = segs[i + 1][0] if i + 1 < len(segs) else 4
            # comping: hits on the beat and on the off-beats (bossa), short and soft
            for hit in (0, 1.5, 3.0):
                if b0 <= hit < b1:
                    dur = min(1.2, b1 - hit) * beat
                    w = sum(epiano(note(n), dur) for n in tones) / len(tones)
                    piano.add(t0 + hit * beat, w * (0.5 if hit else 0.62))
            # bass: root, fifth on the off-beat, back to the root
            rf = note(root)
            for hit, mult in ((0, 1.0), (1.5, 1.5), (2.0, 1.5), (3.5, 1.0)):
                if b0 <= hit < b1:
                    bass.add(t0 + hit * beat, pluck_bass(rf * mult, 0.9 * beat) * 0.55)
        # brushes on every eighth, a soft kick on 1 and 3, rim clicks on a bossa clave
        for e in range(8):
            drums.add(t0 + e * beat / 2, brush(rng, gain=1.0 if e % 2 else 0.6))
        for b in (0, 2):
            drums.add(t0 + b * beat, kick(rng) * 0.35)
        for b in ((0, 1.5, 3) if bar % 2 == 0 else (1, 2.5)):
            drums.add(t0 + b * beat, rim(rng))
        for b, n, d in melody[bar]:
            mel.add(t0 + b * beat, vibes(note(n), d * beat * 1.1) * 0.45)
    mix = piano.buf * 0.9 + bass.buf * 0.8 + drums.buf * 0.8 + mel.buf * 1.0
    # the elevator's speaker: no deep bass, no sparkle
    mix = lowpass(mix, 5200)
    mix = mix - lowpass(mix, 70)
    encode(np.tanh(mix * 1.2), "elevator_music", peak=0.6)


# =============================================================================================
# door 100: the last chase
# =============================================================================================
def chase():
    bpm = 150.0
    beat = 60.0 / bpm
    bars = 8
    length = bars * 4 * beat
    drums, bass, strings, lead, boom = (Loop(length) for _ in range(5))
    rng = np.random.default_rng(1000)
    prog = [("E", ["E3", "G3", "B3"]), ("E", ["E3", "G3", "B3"]), ("C", ["C3", "E3", "G3"]), ("D", ["D3", "F#3", "A3"]),
            ("E", ["E3", "G3", "B3"]), ("E", ["E3", "G3", "B3"]), ("F", ["F3", "A3", "C4"]), ("B", ["B2", "D#3", "F#3"])]
    roots = {"E": "E1", "C": "C2", "D": "D2", "F": "F1", "B": "B1"}
    k, s = kick(rng), snare(rng)
    for bar in range(bars):
        t0 = bar * 4 * beat
        root, triad = prog[bar]
        for b in range(4):
            drums.add(t0 + b * beat, k)
        drums.add(t0 + beat, s)
        drums.add(t0 + 3 * beat, s)
        for h in range(16):
            drums.add(t0 + h * beat / 4, hat(rng, open_=(h % 8 == 6)) * (0.5 if h % 2 == 0 else 0.3))
        if bar == bars - 1:                       # a tom fill into the loop
            for i, f in enumerate((180, 150, 120, 95)):
                t = np.arange(int(0.2 * SR)) / SR
                tom = np.sin(2 * np.pi * f * t * (1 + 0.5 * np.exp(-t * 30))) * np.exp(-t * 14) * 0.7
                drums.add(t0 + (2 + i * 0.5) * beat, tom)
        # the bass pulses in eighths, jumping the octave on the off-beats
        rf = note(roots[root])
        for e in range(8):
            f = rf * (2 if e % 2 else 1)
            w = saw(f, beat / 2 * 0.9) + saw(f, beat / 2 * 0.9, 0.005)
            bass.add(t0 + e * beat / 2, lowpass(w, 500) * env(len(w), 0.003, 0.08, 0.3) * 0.45)
        # staccato strings: the chord in sixteenths, accented in threes
        for h in range(16):
            dur = beat / 4 * 0.6
            w = np.zeros(int(dur * SR))
            for n in triad:
                for dt in (-0.004, 0.004):
                    w += saw(note(n) * 2, dur, dt)[:len(w)]
            acc = 1.0 if h % 3 == 0 else 0.55
            strings.add(t0 + h * beat / 4, lowpass(lowpass(w / 6, 1700), 2600) * env(len(w), 0.002, 0.05, 0.2) * 0.34 * acc)
        # a cinematic boom at the top of every other bar
        if bar % 2 == 0:
            t = np.arange(int(1.6 * SR)) / SR
            f = 38 + 30 * np.exp(-t * 6)
            w = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
            n = rng.standard_normal(len(t))
            boom.add(t0, w * 0.9 + lowpass(n, 300) * np.exp(-t * 5) * 0.5)
        # the brass-like lead in the second half: a falling cry
        if bar >= 4:
            motif = [7, 7, 5, 3, 2, 3, 0, -1] if bar % 2 == 0 else [7, 8, 7, 5, 3, 2, 3, 5]
            base = note("E4") * (2 ** (1 / 12) if root == "F" else 1.0)
            for i, semis in enumerate(motif):
                f = base * 2 ** (semis / 12)
                dur = beat / 2 * 0.85
                w = (saw(f, dur) * 0.6 + square(f, dur, 0.4) * 0.4) * env(int(dur * SR), 0.02, 0.2, 0.6)
                lead.add(t0 + i * beat / 2, lowpass(w, 2600) * 0.16)
    mix = drums.buf * 0.7 + bass.buf * 0.8 + strings.buf * 1.2 + lead.buf * 1.4 + boom.buf * 0.6
    mix = lowpass(mix, 9000)
    encode(np.tanh(mix * 1.1), "door100_chase", peak=0.55)


# =============================================================================================
# Screech's "psst"
# =============================================================================================
def psst():
    rng = np.random.default_rng(77)
    total = int(0.62 * SR)
    out = np.zeros(total)

    def noise(n):
        return rng.standard_normal(n)

    # "p": a puff of breath
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    out[int(0.02 * SR):int(0.02 * SR) + n] += lowpass(noise(n), 1500) * np.exp(-t * 90) * 2.2
    # "sss": a hiss, breathy and wavering
    n = int(0.36 * SR)
    t = np.arange(n) / SR
    h = noise(n)
    h = h - lowpass(h, 3200)
    h = lowpass(h, 9000)
    shape = np.clip(t / 0.05, 0, 1) * np.clip((t[-1] - t) / 0.08, 0, 1) * (1 + 0.25 * np.sin(2 * np.pi * 9 * t))
    out[int(0.07 * SR):int(0.07 * SR) + n] += h * shape * 0.9
    # "t": a click of the tongue
    n = int(0.015 * SR)
    t = np.arange(n) / SR
    c = noise(n)
    out[int(0.47 * SR):int(0.47 * SR) + n] += (c - lowpass(c, 2500)) * np.exp(-t * 300) * 2.0
    encode(out, "psst", peak=0.75)


# =============================================================================================
# Rush
# =============================================================================================
def roar_layers(rng, n, f0, f1, growl=1.0):
    """Rush's voice: a low rumble, a howling roar of filtered noise, a distorted growl gliding from
    f0 to f1 Hz, and crackling static. Each layer comes back separately so the caller can shape it."""
    t = np.arange(n) / SR
    rumble = lowpass(lowpass(rng.standard_normal(n), 140), 140) * 6.0
    howl = rng.standard_normal(n)
    howl = lowpass(howl - lowpass(howl, 300), 1600)
    howl *= 1.0 + 0.6 * np.sin(2 * np.pi * (7 + 5 * t / t[-1]) * t)
    f = f0 + (f1 - f0) * (t / t[-1])
    phase = 2 * np.pi * np.cumsum(f) / SR
    growl_w = np.tanh((2 * ((phase / (2 * np.pi)) % 1.0) - 1) * 3.0 + 0.6 * np.sin(phase * 1.5)) * growl
    static = rng.standard_normal(n)
    static = static - lowpass(static, 3000)
    static *= (rng.random(n) < 0.35) * 1.0          # crackle: noise that cuts in and out
    static = lowpass(static, 9000)
    return t, rumble, howl, growl_w, static


def rush_approach():
    rng = np.random.default_rng(1313)
    n = int(7.0 * SR)
    t, rumble, howl, growl, static = roar_layers(rng, n, 48, 72)
    x = t / t[-1]
    # it starts almost silent, far away, and swells (slowly, then fast) as it comes
    swell = 0.05 + 0.95 * x ** 2.2
    mix = rumble * (0.5 + 0.5 * x) + howl * 0.7 + growl * (0.15 + 0.85 * x ** 1.5) * 0.45 + static * x ** 3 * 0.6
    mix *= swell
    # far away is muffled: the highs open up as it nears
    near = lowpass(mix, 9000)
    far = lowpass(mix, 700)
    mix = far * (1 - x ** 2) + near * x ** 2
    mix[-int(0.03 * SR):] *= np.linspace(1, 0.6, int(0.03 * SR))
    encode(np.tanh(mix * 0.9), "rush_approach", peak=0.8)


def rush_pass():
    rng = np.random.default_rng(1414)
    n = int(2.6 * SR)
    t, rumble, howl, growl, static = roar_layers(rng, n, 96, 44, growl=1.2)
    env_ = np.clip(t / 0.12, 0, 1) * np.exp(-np.maximum(t - 0.35, 0) * 1.9)
    mix = (rumble * 0.8 + howl * 0.8 + growl * 0.55 + static * 0.5) * env_
    encode(np.tanh(mix * 1.1), "rush_pass", peak=0.7)


def main():
    elevator_music()
    chase()
    psst()
    rush_approach()
    rush_pass()


if __name__ == "__main__":
    main()
