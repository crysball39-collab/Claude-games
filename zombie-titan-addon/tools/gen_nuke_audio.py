"""Synthesizes the nukes' sounds, written to the resource pack's sounds/zt/:

  nuke_siren.ogg       an air-raid siren's wail (two rotors a minor third apart), five seconds,
                       played over and over while a silo counts down
  nuke_beep.ogg        the countdown's beep
  nuke_launch.ogg      ignition and the roar of the rocket, fading as it climbs away
  nuke_whistle.ogg     a bomb falling: a whistle dropping in pitch as it nears
  nuke_blast.ogg       the blast heard close: a crack, a roar, a deep boom and falling debris
  nuke_rumble.ogg      the blast heard from far away: a long, low, rolling rumble
  silo_doors.ogg       the silo's hatch doors: hydraulics, a motor straining, grinding, a clunk
  geiger_1..5.ogg      a Geiger counter, two seconds each, clicking faster at each level of
                       radiation (Low to DANGER)

Nothing is sampled; every sound is made here from sines, saws and noise. The OGGs are encoded
with ffmpeg (libvorbis) in bit-exact mode, so the same script always produces the same files.

    python3 tools/gen_nuke_audio.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from gen_doors_audio import SR, lowpass  # noqa: E402
from gen_floor1_audio import encode  # noqa: E402


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def band(x, lo, hi):
    return lowpass(highpass(x, lo), hi)


def sweep(f, harmonics=((1, 1.0),)):
    """A tone following the frequency curve f (Hz per sample), with the given (harmonic, gain)s."""
    phase = 2 * np.pi * np.cumsum(f) / SR
    return sum(g * np.sin(phase * h) for h, g in harmonics)


def times(seconds):
    return np.arange(int(seconds * SR)) / SR


# =============================================================================================
# The silo
# =============================================================================================
def siren():
    """One wail of a two-rotor siren: up for two seconds, held, down again. Five seconds, and it
    starts and ends low and quiet, so it runs on into itself when played again."""
    t = times(5.0)
    up = 1 - np.exp(-t / 0.7)
    down = np.clip((t - 3.0) / 2.0, 0, 1) ** 1.4
    f = 140 + (560 - 140) * up * (1 - down)
    f = f * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * t))                 # the rotor's flutter
    harm = ((1, 1.0), (2, 0.45), (3, 0.3), (4, 0.12), (5, 0.08))
    tone = sweep(f, harm) + 0.8 * sweep(f * 1.2, harm)                # a minor third above
    tone = lowpass(np.tanh(tone * 0.9), 3200)
    rng = np.random.default_rng(8101)
    air = band(rng.standard_normal(len(t)), 300, 2500) * 0.08        # the rush of air through it
    level = np.clip(t / 0.4, 0, 1) * (0.3 + 0.7 * up) * (1 - 0.85 * down)
    encode((tone + air) * level, "nuke_siren", peak=0.7)


def beep():
    t = times(0.2)
    s = np.sign(np.sin(2 * np.pi * 880 * t)) * 0.6 + np.sin(2 * np.pi * 1760 * t) * 0.3
    s = lowpass(s, 5000) * np.clip(t / 0.005, 0, 1) * np.clip((0.2 - t) / 0.03, 0, 1)
    encode(s, "nuke_beep", peak=0.6)


def silo_doors():
    """Three seconds, as long as the doors take to open."""
    rng = np.random.default_rng(8201)
    t = times(3.2)
    n = len(t)
    # hydraulics: a hiss as the pressure goes in, and again as it lets go at the end
    hiss = highpass(rng.standard_normal(n), 2500)
    hiss *= np.exp(-t / 0.25) * 0.9 + np.exp(-np.maximum(t - 2.9, 0) / 0.15) * (t > 2.9) * 0.7
    # the motor, straining as it lifts and easing as they swing over
    f = 70 + 30 * np.sin(np.clip(t / 2.9, 0, 1) * np.pi) ** 0.5
    phase = np.cumsum(f) / SR
    motor = lowpass(2 * (phase % 1.0) - 1, 600) * (t < 2.9) * np.clip(t / 0.2, 0, 1) * 0.5
    # metal grinding on metal round the hinges
    grind = band(rng.standard_normal(n), 600, 1800)
    grind *= (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 3.1 * t))) * (t < 2.9) * 0.35
    # and a heavy clunk as they stop
    k = t - 2.88
    clunk = (np.sin(2 * np.pi * 55 * k) * np.exp(-k / 0.12) * 1.6 + np.sin(2 * np.pi * 410 * k) * np.exp(-k / 0.3) * 0.25 +
             np.sin(2 * np.pi * 637 * k) * np.exp(-k / 0.22) * 0.15) * (k > 0)
    encode(hiss + motor + grind + clunk, "silo_doors", peak=0.75)


# =============================================================================================
# Launch, flight and fall
# =============================================================================================
def launch():
    """Ignition, the roar at full thrust, then fading and dulling as the rocket climbs away."""
    rng = np.random.default_rng(8301)
    t = times(9.0)
    n = len(t)
    roar = lowpass(rng.standard_normal(n), 900) * 2.2
    rumble = lowpass(lowpass(rng.standard_normal(n), 120), 120) * 9.0
    hiss = band(rng.standard_normal(n), 1500, 7000) * 0.5
    # the crackle of a rocket engine: sharp little bangs at random
    crack = np.zeros(n)
    hits = rng.random(n) < 0.004
    crack[hits] = rng.choice([-1.0, 1.0], hits.sum()) * rng.uniform(0.6, 1.5, hits.sum())
    crack = lowpass(crack, 6000) * 14
    whump = np.sin(2 * np.pi * (45 - 20 * np.clip(t / 0.4, 0, 1)) * t) * np.exp(-t / 0.35) * 3.0 * (t < 1.5)
    thrust = np.clip(t / 0.5, 0, 1)
    away = np.exp(-np.maximum(t - 2.2, 0) / 2.0)
    mix = (roar + rumble + hiss + crack * (0.4 + 0.6 * away)) * thrust * away + whump
    # as it goes the sound dulls: the highs drop away
    far = lowpass(mix, 500)
    x = np.clip((t - 2.2) / 5.0, 0, 1)
    mix = mix * (1 - x) + far * x
    encode(np.tanh(mix * 0.5), "nuke_launch", peak=0.75)


def whistle():
    """Four seconds of a bomb falling, nearer and lower all the while."""
    rng = np.random.default_rng(8401)
    t = times(4.0)
    x = t / t[-1]
    f = 1900 * (1 - x) + 480 * x - 260 * x ** 3
    tone = sweep(f, ((1, 1.0), (2, 0.18), (3, 0.06)))
    tone *= 1 + 0.05 * np.sin(2 * np.pi * 7 * t)
    wind = band(rng.standard_normal(len(t)), 400, 3000) * 0.35
    level = 0.1 + 0.9 * x ** 1.8
    out = (tone * 0.8 + wind * (0.3 + 0.7 * x)) * level
    out[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
    encode(out, "nuke_whistle", peak=0.7)


# =============================================================================================
# The blast
# =============================================================================================
def blast():
    """Heard close: a crack, a roar that swamps everything, a deep boom, then debris falling
    and a long rumbling tail. Ten seconds."""
    rng = np.random.default_rng(8501)
    t = times(10.0)
    n = len(t)
    crack = rng.standard_normal(n) * np.exp(-t / 0.02) * 6.0
    roar = lowpass(rng.standard_normal(n), 1400) * 3.0 * np.clip(t / 0.05, 0, 1) * np.exp(-t / 1.6)
    boom = np.sin(2 * np.pi * np.cumsum(28 + 50 * np.exp(-t / 0.5)) / SR) * np.exp(-t / 2.2) * 2.4
    rumble = lowpass(lowpass(rng.standard_normal(n), 90), 90) * 18.0
    rumble *= np.clip(t / 0.3, 0, 1) * np.exp(-t / 3.5) * (1 + 0.5 * np.sin(2 * np.pi * 0.7 * t))
    debris = np.zeros(n)
    for _ in range(140):
        at = rng.uniform(0.8, 7.5)
        i = int(at * SR)
        m = min(n - i, int(0.06 * SR))
        k = np.arange(m) / SR
        debris[i:i + m] += highpass(rng.standard_normal(m), 1200) * np.exp(-k / 0.012) * rng.uniform(0.2, 1.0) * np.exp(-at / 4)
    # (and its body, in the range a phone's speaker can play)
    body = band(rng.standard_normal(n), 90, 700) * 5.0 * np.clip(t / 0.08, 0, 1) * np.exp(-t / 2.4)
    mix = crack + roar + boom + rumble + body + debris * 1.4
    encode(np.tanh(mix * 0.45), "nuke_blast", peak=0.8)


def rumble():
    """Heard from far away: no crack, only a long low roll, like thunder that doesn't stop."""
    rng = np.random.default_rng(8601)
    t = times(11.0)
    n = len(t)
    low = lowpass(lowpass(rng.standard_normal(n), 70), 70) * 22.0
    mid = band(band(rng.standard_normal(n), 60, 420), 60, 420) * 14.0
    rolls = np.zeros(n)
    for at, size in ((0.0, 1.0), (1.3, 0.7), (2.4, 0.8), (4.1, 0.5), (6.0, 0.35)):
        rolls += size * np.exp(-((t - at - 0.4) / 0.7) ** 2)
    shape = np.clip(t / 0.6, 0, 1) * np.exp(-t / 4.0) * (0.5 + rolls)
    mix = (low + mid) * shape
    mix[-int(0.5 * SR):] *= np.linspace(1, 0, int(0.5 * SR))
    encode(np.tanh(mix * 0.5), "nuke_rumble", peak=0.85)


# =============================================================================================
# The Geiger counter
# =============================================================================================
GEIGER_RATES = (3, 8, 18, 40, 95)          # clicks a second: Low, Medium, High, Extreme, DANGER


def geiger():
    for level, rate in enumerate(GEIGER_RATES, 1):
        rng = np.random.default_rng(8700 + level)
        n = int(2.0 * SR)
        out = np.zeros(n)
        at = 0.0
        while True:
            at += rng.exponential(1 / rate)
            if at >= 2.0 - 0.01:
                break
            i = int(at * SR)
            m = min(n - i, int(0.006 * SR))
            k = np.arange(m) / SR
            f = rng.uniform(2800, 3600)
            out[i:i + m] += (np.sin(2 * np.pi * f * k) * 0.8 + rng.standard_normal(m) * 0.5) * np.exp(-k / 0.0012) * rng.uniform(0.7, 1.0)
        encode(out, "geiger_%d" % level, peak=0.6)


def main():
    siren()
    beep()
    silo_doors()
    launch()
    whistle()
    blast()
    rumble()
    geiger()


if __name__ == "__main__":
    main()
