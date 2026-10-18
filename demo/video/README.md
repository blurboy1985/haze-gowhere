# Demo video (44 s, 3D user story)

Output: `out/haze-gowhere-demo.mp4` (1280×720, 30 fps, H.264 + AAC, about −15 LUFS).

The story: the Lim family in Bishan checks the haze (live 24-hr PSI 229), searches for Gardens by the Bay in the **real app**, and takes the recommended Circle Line + indoor link route (35 min, 8 Exposed min). The phone screens are a recording of the real UI with live NEA and OneMap data, taken on 18 Oct 2026 at 9:00 am SGT.

```bash
npm install
npm run dev            # in the repo root: the app at http://localhost:5173 (real OneMap routing needs .env credentials)
node capture-app.mjs   # records the real UI -> out/app/*.png + manifest.json (numbers vary with live haze)
node tts.mjs           # ElevenLabs narration -> out/vo/*.mp3 (needs ELEVENLABS_API_KEY in the repo .env)
python music.py        # synthesized background music -> out/music.wav
node render.mjs        # Three.js scene.html -> out/frames; --stills 9.5,25 for spot checks
node mux.mjs           # frames + narration + ducked music -> out/haze-gowhere-demo.mp4
```

- `characters.js` holds the family (faces, hair, clothes, walk cycle). Preview them with `node preview.mjs ../.. demo/video/chars-preview.html front,side,face,worried`.
- Narration is in `script.json` and its timing in `timeline.json`. If you change the script or re-capture the app, update the times in `scene.html` (the `appCues`, camera `keys` and `hudStates` tables) to match.
- `out/app` isn't committed (48 MB of PNGs). Re-capture it before re-rendering. A new capture shows that moment's live haze, so the narration may need new numbers.
- The voice is the premade "Bella". Free ElevenLabs accounts can't use library voices through the API. Set `VOICE_ID` to change it.
