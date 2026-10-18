// Generates one ElevenLabs narration clip per scene line into out/vo/<id>.mp3.
// Reads ELEVENLABS_API_KEY from the repo's .env (never logged).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const key = env.match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");
if (!key) throw new Error("ELEVENLABS_API_KEY missing from .env");

const VOICE = process.env.VOICE_ID ?? "hpp4J3VqNfWAUOO0d1Us"; // "Bella", a premade voice (free tier can't use library voices via API)
const lines = JSON.parse(readFileSync(new URL("./script.json", import.meta.url), "utf8"));
mkdirSync("out/vo", { recursive: true });

const durations = {};
for (const { id, text } of lines) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status} ${await res.text()}`);
  const file = `out/vo/${id}.mp3`;
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  durations[id] = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
  console.log(id, durations[id].toFixed(2) + "s");
}
writeFileSync("out/vo/durations.json", JSON.stringify(durations, null, 2));
