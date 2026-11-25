"""Render the original 32-second MindCanvas piano loop.

Run `python3 apps/web/scripts/generate-focus-piano.py /tmp/focus-piano.wav`, then
`ffmpeg -i /tmp/focus-piano.wav -c:a libmp3lame -b:a 56k apps/web/public/audio/mindcanvas-focus-piano.mp3`.
"""
import math, random, struct, sys, wave
# Original eight-bar piano study. No samples or third-party recording.
rng = random.Random(128)
rate, bar = 24000, 4.0
notes = [
  ((48,55,59,64),(76,None,74,None,71,None,67,None)),
  ((45,52,55,60),(72,None,71,None,67,None,64,None)),
  ((41,48,52,57),(69,None,72,None,76,74,None,None)),
  ((43,50,55,59),(71,None,74,None,67,None,None,None)),
  ((48,55,59,64),(76,None,79,None,76,None,74,None)),
  ((45,52,55,60),(72,None,76,None,71,None,67,None)),
  ((41,48,52,57),(69,None,72,74,76,None,72,None)),
  ((43,50,55,62),(71,None,69,None,67,None,None,None)),
]
buf = [0.0] * (rate * int(bar) * len(notes))
def add(note, start, velocity, length=3.4, echo=0.17):
    freq = 440 * 2**((note-69)/12)
    p = [rng.uniform(0,2*math.pi) for _ in range(4)]
    targets = [int((start+x)*rate) for x in (0,echo,echo*2.2)]
    for i in range(int(length*rate)):
        t = i/rate
        env = min(1,t/0.014) * math.exp(-t*(1.35+max(note-55,0)*0.015)) * min(1,(length-t)/.15)
        v = sum(g * math.cos(2*math.pi*freq*h*(1+0.0002*h*h)*t+p[h-1]) * math.exp(-t*.29*(h-1)) for h,g in enumerate((1,.28,.10,.035),1)) * env * velocity
        for j,gain in zip(targets,(1,.13,.06)): buf[(j+i)%len(buf)] += v*gain
for n,(chord,melody) in enumerate(notes):
    start = n*bar
    add(chord[0],start,.21)
    for i,key in enumerate((1,2,3,2,1,2,3),1): add(chord[key],start+i*.5,.09,length=2.2)
    for i,pitch in enumerate(melody):
        if pitch: add(pitch,start+i*.5+.025,.19,length=2.6)
with wave.open(sys.argv[1],"wb") as f:
    f.setparams((1,2,rate,0,"NONE","not compressed"))
    f.writeframes(b"".join(struct.pack("<h",int(max(-1,min(1,x))*29500)) for x in buf))
