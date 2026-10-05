"""Synthesizes the Seek chase's music: an original, seamlessly looping chase
track (160 BPM, D minor: i - VI - VII - V), written to
sounds/zt/seek_chase.ogg in the resource pack. Nothing is sampled; every
sound is made here from sine, saw and noise.

The OGG is encoded with ffmpeg (libvorbis) in bit-exact mode, so the same
script always produces the same file.

    python3 tools/gen_doors_audio.py
"""
import os
import shutil
import subprocess
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "packs", "ZombieTitan_RP", "sounds", "zt", "seek_chase.ogg")

SR = 32000
BPM = 160.0
BEAT = 60.0 / BPM
BARS = 16
LOOP = BARS * 4 * BEAT
N = int(round(LOOP * SR))


def note(name):
    names = {"C": -9, "C#": -8, "D": -7, "D#": -6, "Eb": -6, "E": -5, "F": -4, "F#": -3, "G": -2, "G#": -1, "Ab": -1,
             "A": 0, "A#": 1, "Bb": 1, "B": 2}
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[pitch] + (octave - 4) * 12) / 12.0)


class Track:
    def __init__(self):
        self.buf = np.zeros(N)

    def add(self, start, wave):
        """Mix `wave` in at `start` seconds; whatever runs past the end wraps to the start (a seamless loop)."""
        i = int(round(start * SR)) % N
        k = 0
        while k < len(wave):
            n = min(len(wave) - k, N - i)
            self.buf[i:i + n] += wave[k:k + n]
            k += n
            i = 0


def env(n, attack, decay, sustain=0.0, release=None):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = sustain + (1 - sustain) * np.exp(-np.maximum(t - attack, 0) / max(decay, 1e-4))
    e = a * d
    if release:
        tail = np.clip((t[-1] - t) / release, 0, 1)
        e *= tail
    return e


def lowpass(x, cutoff):
    """One-pole low-pass, as a convolution with its (truncated) exponential impulse response."""
    a = np.exp(-2 * np.pi * cutoff / SR)
    n = max(2, int(np.log(1e-5) / np.log(a)) + 1)
    h = (1 - a) * a ** np.arange(n)
    return np.convolve(x, h)[:len(x)]


def saw(freq, dur, detune=0.0):
    t = np.arange(int(dur * SR)) / SR
    f = freq * (1 + detune)
    return 2 * ((t * f) % 1.0) - 1


def square(freq, dur, duty=0.5):
    t = np.arange(int(dur * SR)) / SR
    return np.where((t * freq) % 1.0 < duty, 1.0, -1.0)


def kick(rng):
    dur = 0.32
    t = np.arange(int(dur * SR)) / SR
    f = 46 + 110 * np.exp(-t * 28)
    phase = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(phase) * np.exp(-t * 9)
    click = rng.standard_normal(len(t)) * np.exp(-t * 300) * 0.25
    return (body + click) * 0.95


def snare(rng):
    dur = 0.22
    t = np.arange(int(dur * SR)) / SR
    noise = rng.standard_normal(len(t))
    noise = noise - lowpass(noise, 900)              # crude high-pass
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    return (noise * np.exp(-t * 18) * 0.8 + tone) * 1.1


def hat(rng, open_=False):
    dur = 0.18 if open_ else 0.05
    t = np.arange(int(dur * SR)) / SR
    noise = rng.standard_normal(len(t))
    noise = noise - lowpass(noise, 5000)
    return noise * np.exp(-t * (14 if open_ else 70)) * 0.36


def main():
    rng = np.random.default_rng(3030)
    drums, bass, pad, lead = Track(), Track(), Track(), Track()
    # i - VI - VII - V, two bars each, twice per loop
    chords = [("D", ["D3", "F3", "A3"]), ("Bb", ["Bb2", "D3", "F3"]), ("C", ["C3", "E3", "G3"]), ("A", ["A2", "C#3", "E3"])]
    bass_roots = {"D": "D2", "Bb": "Bb1", "C": "C2", "A": "A1"}
    k, s = kick(rng), snare(rng)
    for bar in range(BARS):
        t0 = bar * 4 * BEAT
        root, triad = chords[(bar // 2) % 4]
        # drums: four on the floor, snare on 2 and 4, driving 16th hats, a fill every fourth bar
        for b in range(4):
            drums.add(t0 + b * BEAT, k)
        drums.add(t0 + 1 * BEAT, s)
        drums.add(t0 + 3 * BEAT, s)
        if bar % 4 == 3:
            for x in (3.5, 3.75):
                drums.add(t0 + x * BEAT, s * 0.7)
        for h in range(16):
            drums.add(t0 + h * BEAT / 4, hat(rng, open_=(h % 8 == 6)) * (1.0 if h % 2 == 0 else 0.6))
        # bass: galloping 16ths on the root, a step up on the last beat
        rf = note(bass_roots[root])
        for h in range(16):
            f = rf * (1.5 if h in (14,) else (1.189 if h == 15 else 1.0))
            dur = BEAT / 4
            w = saw(f, dur * 0.95) + saw(f, dur * 0.95, 0.004)
            w = lowpass(w, 420 + 260 * (h % 4 == 0)) * env(len(w), 0.004, 0.07, 0.25) * 0.42
            bass.add(t0 + h * BEAT / 4, w)
        # strings: a held, slowly swelling chord (one per two bars)
        if bar % 2 == 0:
            dur = 8 * BEAT
            w = np.zeros(int(dur * SR))
            for n in triad:
                f = note(n) * 2
                for dt in (-0.006, 0.0, 0.006):
                    w += saw(f, dur, dt)[:len(w)]
            w = lowpass(w / 9.0, 1400) * env(len(w), 1.2, 6.0, 0.6, release=0.6) * 0.32
            pad.add(t0, w)
        # lead: an alarm-like stabbing figure in the second half of the loop
        if bar >= 8:
            motif = [0, 0, 7, 0, 0, 8, 7, 3] if bar % 2 == 0 else [0, 0, 7, 0, 10, 8, 7, 5]
            base = note(triad[0]) * 4
            for i, semis in enumerate(motif):
                f = base * 2 ** (semis / 12)
                dur = BEAT / 2 * 0.6
                w = square(f, dur, 0.3) * env(int(dur * SR), 0.003, 0.09, 0.3) * 0.11
                lead.add(t0 + i * BEAT / 2 + BEAT / 4, lowpass(w, 3200))
        # a rising siren over the last two bars, so the loop feels like it never lets up
        if bar >= 14:
            dur = 4 * BEAT
            t = np.arange(int(dur * SR)) / SR
            f = 300 + 500 * ((bar - 14) * dur + t) / (2 * dur)
            ph = 2 * np.pi * np.cumsum(f) / SR
            lead.add(t0, np.sin(ph) * 0.05 * env(len(t), 0.5, 3.0, 0.8))
    mix = drums.buf * 0.75 + bass.buf * 0.7 + pad.buf * 1.7 + lead.buf * 1.9
    mix -= mix.mean()
    mix = np.tanh(mix * 1.05)
    mix /= np.max(np.abs(mix)) / 0.66    # headroom: Vorbis overshoots the sharp kick transients
    pcm = (mix * 32767).astype("<i2").tobytes()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        if os.path.exists(OUT):
            print("ffmpeg not found; keeping the existing", os.path.relpath(OUT, ROOT))
            return
        sys.exit("ffmpeg is needed to encode the chase music")
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0",
                    "-c:a", "libvorbis", "-q:a", "2", "-fflags", "+bitexact", "-flags:a", "+bitexact",
                    "-map_metadata", "-1", OUT], input=pcm, check=True)
    print("chase music written: %.1f s, %d KB" % (LOOP, os.path.getsize(OUT) // 1024))


if __name__ == "__main__":
    main()
