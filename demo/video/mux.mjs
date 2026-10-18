// Muxes out/frames + narration (timed per timeline.json) + music (ducked under the voice) into the final MP4.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const { duration, fps, atempo, lines } = JSON.parse(readFileSync("timeline.json", "utf8"));
const out = "out/haze-gowhere-demo.mp4";
const vo = lines.map((l, i) => `[${i + 2}:a]aformat=sample_rates=44100:channel_layouts=stereo,atempo=${atempo},adelay=${Math.round(l.start * 1000)}:all=1[v${i}]`);
const filter = [
  ...vo,
  `${lines.map((_, i) => `[v${i}]`).join("")}amix=inputs=${lines.length}:normalize=0,apad,asplit[vo][key]`,
  `[1:a]volume=0.45[mus]`,
  `[mus][key]sidechaincompress=threshold=0.02:ratio=8:attack=30:release=500[ducked]`,
  `[ducked][vo]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000[aout]`,
].join(";");

execFileSync("ffmpeg", [
  "-v", "error", "-y",
  "-framerate", String(fps), "-i", "out/frames/f%04d.jpg",
  "-i", "out/music.wav",
  ...lines.flatMap((l) => ["-i", `out/vo/${l.id}.mp3`]),
  "-filter_complex", filter,
  "-map", "0:v", "-map", "[aout]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k",
  "-t", String(duration), "-movflags", "+faststart", out,
], { stdio: "inherit" });
console.log("wrote", out);
