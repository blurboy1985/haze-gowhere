"""Synthesizes the 44 s background track (out/music.wav): no samples, so no licensing.
Calm pad (A) -> tense minor turn when the haze arrives (B) -> hopeful arpeggio + pulse once the app finds the route (C/D) -> resolve."""
import wave
import numpy as np

SR, DUR, BEAT = 44100, 44.0, 60 / 96
t = np.arange(int(SR * DUR)) / SR
L = np.zeros_like(t); R = np.zeros_like(t)
hz = lambda n: 440 * 2 ** ((n - 69) / 12)  # MIDI -> Hz

chords = [  # (start, end, MIDI notes); sections follow timeline.json scenes
    (0.0, 5.2, [48, 52, 55, 59, 62]),      # Cmaj9, Sunday morning
    (5.0, 10.2, [45, 48, 52, 59]),         # Am(add9), the haze rolls in
    (10.0, 16.5, [41, 44, 48, 51]),        # Fm7, PSI 229
    (16.3, 20.0, [38, 41, 45, 48]),        # Dm7, searching
    (19.8, 23.8, [43, 47, 50, 53]),        # G7, routes loading
    (23.6, 28.2, [41, 45, 48, 52, 57]),    # Fmaj7, the pick
    (28.0, 32.2, [43, 47, 50, 52, 59]),    # G6
    (32.0, 36.2, [45, 48, 52, 55]),        # Am7, on the move
    (36.0, 40.2, [41, 45, 48, 52]),        # Fmaj7 -> arriving
    (40.0, 44.0, [48, 52, 55, 59, 64]),    # Cmaj7, logo
]

def env(a, b, att=0.7, rel=0.7):
    e = np.clip((t - a) / att, 0, 1) * np.clip((b - t) / rel, 0, 1)
    return e * e * (3 - 2 * e)

# pad: detuned soft harmonics
for a, b, notes in chords:
    e = env(a, b)
    m = e > 0
    for n in notes:
        f = hz(n)
        for det, side in ((0.9985, L), (1.0015, R)):
            tone = sum(np.sin(2 * np.pi * f * k * det * t[m] + k) / k ** 1.6 for k in (1, 2, 3, 4))
            side[m] += 0.05 * e[m] * tone * (1 + 0.15 * np.sin(2 * np.pi * 0.2 * t[m] + n))

# sub bass on chord roots
for a, b, notes in chords:
    e = env(a, b, 0.3, 0.4); m = e > 0
    s = 0.09 * e[m] * np.sin(2 * np.pi * hz(notes[0] - 12) * t[m])
    L[m] += s; R[m] += s

def hit(start, dur, fn, amp, pan=0.0):
    i0 = int(start * SR); n = min(int(dur * SR), len(t) - i0)
    if n <= 0: return
    x = amp * fn(np.arange(n) / SR)
    L[i0:i0 + n] += x * (1 - pan); R[i0:i0 + n] += x * (1 + pan)

# arpeggio (eighths) from the app reveal to the arrival
step = BEAT / 2
for i, st in enumerate(np.arange(23.6, 39.9, step)):
    notes = next(c[2] for c in reversed(chords) if c[0] <= st + 0.01)
    n = notes[[0, 2, 1, 3, 2, 4 % len(notes), 1, 2][i % 8] % len(notes)] + 24
    f = hz(n); swell = 0.6 + 0.4 * min(1, (st - 23.6) / 8)
    hit(st, 0.6, lambda x: (np.sin(2 * np.pi * f * x) + 0.3 * np.sin(4 * np.pi * f * x)) * np.exp(-x * 7), 0.09 * swell, pan=0.35 * np.sin(i))

# soft kick on beats + offbeat shaker
rng = np.random.default_rng(3)
for st in np.arange(23.6, 39.8, BEAT):
    hit(st, 0.3, lambda x: np.sin(2 * np.pi * (45 * x + 75 / 18 * (1 - np.exp(-18 * x)))) * np.exp(-x * 12), 0.32)
for st in np.arange(31.2 + BEAT / 2, 39.8, BEAT):
    hit(st, 0.08, lambda x: rng.standard_normal(len(x)) * np.exp(-x * 60), 0.025, pan=0.4)

# riser into the logo, then a bell on the resolve
hit(38.2, 1.8, lambda x: rng.standard_normal(len(x)) * (x / 1.8) ** 2, 0.05)
# soft heartbeat pulse under the haze reveal
for st in np.arange(10.0, 16.2, BEAT * 2):
    hit(st, 0.4, lambda x: np.sin(2 * np.pi * 55 * x) * np.exp(-x * 9), 0.16)
for n in (72, 76, 79):
    hit(40.0, 3.5, lambda x, f=hz(n): np.sin(2 * np.pi * f * x) * np.exp(-x * 1.2), 0.07)

# master: gentle fades, normalize to -3 dBFS peak
fade = np.clip(t / 1.2, 0, 1) * np.clip((DUR - t) / 1.6, 0, 1)
L *= fade; R *= fade
peak = max(np.abs(L).max(), np.abs(R).max())
stereo = (np.stack([L, R], 1) / peak * 0.707 * 32767).astype(np.int16)
with wave.open("out/music.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(stereo.tobytes())
print("wrote out/music.wav", f"{DUR}s")
