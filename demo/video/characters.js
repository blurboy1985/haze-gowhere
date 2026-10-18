// Stylized 3D family for the demo video: faces, hair styles, clothes and a walk cycle.
import * as THREE from "three";

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.62, ...extra });

function patternTex(base, draw, repeat = [2, 2]) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"); g.fillStyle = base; g.fillRect(0, 0, 64, 64); draw(g);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const dots = (base, dot) => patternTex(base, (g) => { g.fillStyle = dot; for (const [x, y] of [[16, 16], [48, 48], [48, 16], [16, 48], [32, 32]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); } }, [3, 3]);
const stripes = (base, line) => patternTex(base, (g) => { g.fillStyle = line; g.fillRect(0, 0, 64, 14); g.fillRect(0, 32, 64, 14); }, [1, 3]);
const floral = (base, petal) => patternTex(base, (g) => {
  for (const [x, y] of [[18, 18], [46, 44]]) { g.fillStyle = petal; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x + Math.cos(i * 1.26) * 6, y + Math.sin(i * 1.26) * 6, 4.5, 0, 7); g.fill(); } g.fillStyle = "#fde68a"; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
}, [3, 3]);

function mesh(geo, mat, parent, pos = [0, 0, 0], shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.castShadow = shadow; parent.add(m); return m;
}

/**
 * spec: { h, headRatio, legRatio, skin, hair, hairStyle, top, topMat?, sleeves, bottom, bottomStyle, shoes, extras: [] }
 * Returns a THREE.Group with userData.pose(walkPhase, walking, opts) and userData.setMood("happy"|"worried").
 */
export function makePerson(spec) {
  const { h } = spec;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body); // bobs while walking
  const headR = h * spec.headRatio, legLen = h * spec.legRatio, neck = h * 0.025;
  const torsoLen = h - legLen - headR * 2 - neck;
  const torsoW = h * (spec.child ? 0.2 : 0.22);
  const skin = std(spec.skin), hairM = std(spec.hair, { roughness: 0.8 });
  const topM = spec.topMat ?? std(spec.top), bottomM = std(spec.bottom), shoeM = std(spec.shoes, { roughness: 0.4 });

  // legs (pivot at hip)
  const legs = [-1, 1].map((side) => {
    const pivot = new THREE.Group(); pivot.position.set(side * torsoW * 0.24, legLen, 0); body.add(pivot);
    const r = h * (spec.child ? 0.048 : 0.045), shoeH = h * 0.035;
    const len = legLen - shoeH;
    if (spec.bottomStyle === "shorts" || spec.bottomStyle === "skirt" || spec.bottomStyle === "dress") {
      const upper = spec.bottomStyle === "shorts" ? len * 0.45 : len * 0.2;
      mesh(new THREE.CapsuleGeometry(r * 1.15, upper, 4, 10), bottomM, pivot, [0, -upper / 2 - r * 0.5, 0]);
      mesh(new THREE.CapsuleGeometry(r * 0.85, len - upper - r, 4, 10), skin, pivot, [0, -upper - (len - upper) / 2, 0]);
    } else {
      mesh(new THREE.CapsuleGeometry(r, len - r, 4, 10), bottomM, pivot, [0, -len / 2, 0]);
    }
    const shoe = mesh(new THREE.BoxGeometry(r * 2.3, shoeH * 1.4, r * 3.6), shoeM, pivot, [0, -legLen + shoeH * 0.7, r * 0.7]);
    shoe.geometry.translate(0, 0, 0);
    if (spec.shoeSole) mesh(new THREE.BoxGeometry(r * 2.4, shoeH * 0.4, r * 3.7), std(spec.shoeSole), pivot, [0, -legLen + shoeH * 0.2, r * 0.7]);
    return pivot;
  });

  // torso
  const torsoY = legLen + torsoLen / 2;
  const torso = mesh(new THREE.CapsuleGeometry(torsoW / 2, Math.max(0.01, torsoLen - torsoW * 0.9), 6, 14), topM, body, [0, torsoY, 0]);
  torso.scale.set(1, 1, 0.68);
  if (spec.bottomStyle === "skirt" || spec.bottomStyle === "dress") {
    const sk = mesh(new THREE.CylinderGeometry(torsoW * 0.5, torsoW * 0.85, legLen * 0.48, 18, 1, true), spec.bottomStyle === "dress" ? topM : bottomM, body, [0, legLen - legLen * 0.15, 0]);
    sk.material = sk.material.clone(); sk.material.side = THREE.DoubleSide; sk.scale.z = 0.8;
  } else {
    mesh(new THREE.CapsuleGeometry(torsoW * 0.48, torsoW * 0.15, 4, 12), bottomM, body, [0, legLen + torsoW * 0.1, 0]).scale.z = 0.7; // hips/waistband
  }
  if (spec.collar) mesh(new THREE.TorusGeometry(h * 0.04, h * 0.012, 6, 16), std(spec.collar), body, [0, legLen + torsoLen - h * 0.005, 0]).rotation.x = Math.PI / 2;
  if (spec.belt) mesh(new THREE.CylinderGeometry(torsoW * 0.5, torsoW * 0.5, h * 0.018, 16), std(spec.belt), body, [0, legLen + torsoW * 0.18, 0]).scale.z = 0.7;

  // arms (pivot at shoulder)
  const armLen = h * (spec.child ? 0.3 : 0.33);
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group(); pivot.position.set(side * (torsoW / 2 + h * 0.02), legLen + torsoLen - h * 0.04, 0); body.add(pivot);
    const r = h * 0.033;
    const sleeve = spec.sleeves === "long" ? armLen * 0.85 : armLen * 0.38;
    mesh(new THREE.CapsuleGeometry(r * 1.2, sleeve - r, 4, 10), topM, pivot, [0, -sleeve / 2, 0]);
    if (sleeve < armLen * 0.8) mesh(new THREE.CapsuleGeometry(r * 0.9, armLen - sleeve - r, 4, 10), skin, pivot, [0, -sleeve - (armLen - sleeve) / 2 + r * 0.3, 0]);
    const hand = mesh(new THREE.SphereGeometry(r * 1.3, 12, 10), skin, pivot, [0, -armLen, 0]);
    pivot.userData.hand = hand;
    return pivot;
  });

  // neck + head
  mesh(new THREE.CylinderGeometry(h * 0.028, h * 0.032, neck * 2, 10), skin, body, [0, legLen + torsoLen + neck * 0.4, 0]);
  const head = new THREE.Group(); head.position.set(0, legLen + torsoLen + neck + headR, 0); body.add(head);
  mesh(new THREE.SphereGeometry(headR, 28, 22), skin, head).scale.set(1, 1.04, 0.98);
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(headR * 0.2, 10, 8), skin, head, [s * headR * 0.97, -headR * 0.05, 0]).scale.set(0.6, 1, 0.8); // ears
    const eye = mesh(new THREE.SphereGeometry(headR * 0.12, 14, 12), std(0x1b1410, { roughness: 0.15 }), head, [s * headR * 0.36, headR * 0.06, headR * 0.89], false);
    eye.scale.set(0.9, 1.25, 0.6);
    mesh(new THREE.SphereGeometry(headR * 0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), head, [s * headR * 0.36 + headR * 0.04, headR * 0.12, headR * 0.97], false);
    const brow = mesh(new THREE.BoxGeometry(headR * 0.26, headR * 0.05, headR * 0.06), hairM, head, [s * headR * 0.37, headR * 0.32, headR * 0.9], false);
    brow.userData.side = s; head.userData[`brow${s}`] = brow;
    mesh(new THREE.SphereGeometry(headR * 0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf28b8b, transparent: true, opacity: 0.45, roughness: 0.9 }), head, [s * headR * 0.55, -headR * 0.22, headR * 0.78], false).scale.set(1, 0.6, 0.4);
  }
  mesh(new THREE.SphereGeometry(headR * 0.1, 10, 8), std(new THREE.Color(spec.skin).multiplyScalar(0.92)), head, [0, -headR * 0.08, headR * 1.0], false);
  const smile = mesh(new THREE.TorusGeometry(headR * 0.2, headR * 0.035, 6, 16, Math.PI), std(0x7a2e2e), head, [0, -headR * 0.33, headR * 0.92], false);
  smile.rotation.z = Math.PI; // arc opens upward = smile
  const frown = mesh(new THREE.TorusGeometry(headR * 0.14, headR * 0.03, 6, 16, Math.PI), std(0x7a2e2e), head, [0, -headR * 0.45, headR * 0.9], false);
  frown.visible = false;

  // hair
  const cap = (theta, tilt = -0.35, scale = 1.07) => { const m = mesh(new THREE.SphereGeometry(headR * scale, 26, 16, 0, Math.PI * 2, 0, theta), hairM, head); m.rotation.x = tilt; return m; };
  switch (spec.hairStyle) {
    case "short":
      cap(Math.PI * 0.52);
      mesh(new THREE.SphereGeometry(headR * 0.55, 14, 10), hairM, head, [headR * 0.25, headR * 0.72, headR * 0.45]).scale.set(1.3, 0.45, 0.8);
      break;
    case "bob": {
      cap(Math.PI * 0.5, -0.2, 1.08);
      // back-only shell (phi pi..2pi is the -z half) so it frames the face instead of covering it
      const back = mesh(new THREE.SphereGeometry(headR * 1.12, 24, 18, Math.PI * 0.92, Math.PI * 1.16, 0, Math.PI * 0.72), hairM, head, [0, -headR * 0.02, -headR * 0.04]);
      back.material = hairM.clone(); back.material.side = THREE.DoubleSide;
      const pony = mesh(new THREE.SphereGeometry(headR * 0.42, 14, 12), hairM, head, [0, headR * 0.05, -headR * 1.15]); pony.scale.set(0.9, 1.6, 0.9);
      mesh(new THREE.TorusGeometry(headR * 0.18, headR * 0.06, 6, 12), std(spec.accent ?? 0xf43f5e), head, [0, headR * 0.45, -headR * 1.02]).rotation.x = 1.2;
      break;
    }
    case "pigtails":
      cap(Math.PI * 0.55, -0.25);
      for (const s of [-1, 1]) {
        mesh(new THREE.SphereGeometry(headR * 0.36, 14, 12), hairM, head, [s * headR * 1.08, -headR * 0.05, -headR * 0.15]).scale.set(0.8, 1.35, 0.8);
        mesh(new THREE.SphereGeometry(headR * 0.12, 10, 8), std(spec.accent ?? 0xec4899), head, [s * headR * 0.98, headR * 0.3, -headR * 0.12]);
      }
      break;
    case "tuft":
      cap(Math.PI * 0.36, -0.2, 1.04);
      mesh(new THREE.TorusGeometry(headR * 0.16, headR * 0.05, 6, 12, Math.PI * 1.4), hairM, head, [0, headR * 1.05, headR * 0.1]).rotation.y = Math.PI / 2;
      break;
  }

  // accessories
  for (const x of spec.extras ?? []) {
    if (x === "glasses") {
      const fm = std(0x1f2937, { roughness: 0.3 });
      for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(headR * 0.2, headR * 0.03, 6, 18), fm, head, [s * headR * 0.36, headR * 0.06, headR * 0.98], false);
      mesh(new THREE.BoxGeometry(headR * 0.25, headR * 0.03, headR * 0.03), fm, head, [0, headR * 0.1, headR * 1.0], false);
    }
    if (x === "backpack" || x === "kidpack") {
      const kid = x === "kidpack";
      const bp = mesh(new THREE.BoxGeometry(torsoW * (kid ? 0.8 : 0.85), torsoLen * (kid ? 0.6 : 0.72), torsoW * 0.4), std(kid ? 0x8b5cf6 : 0x334155), body, [0, legLen + torsoLen * 0.55, -torsoW * 0.45]);
      bp.geometry = new THREE.CapsuleGeometry(torsoW * 0.35, torsoLen * 0.35, 4, 10); bp.scale.set(1.15, 1, 0.55);
      mesh(new THREE.BoxGeometry(torsoW * 0.5, torsoLen * 0.18, torsoW * 0.12), std(kid ? 0xfbbf24 : 0x0f766e), body, [0, legLen + torsoLen * 0.42, -torsoW * 0.66]);
      for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(h * 0.02, torsoLen * 0.8, h * 0.012), std(0x1f2937), body, [s * torsoW * 0.28, legLen + torsoLen * 0.55, torsoW * 0.34]);
    }
    if (x === "bag") {
      const strap = mesh(new THREE.BoxGeometry(h * 0.016, torsoLen * 1.25, h * 0.01), std(0x7c4a24), body, [0, legLen + torsoLen * 0.55, torsoW * 0.35]);
      strap.rotation.z = 0.62;
      mesh(new THREE.BoxGeometry(torsoW * 0.55, torsoW * 0.42, torsoW * 0.18), std(0xb7793f, { roughness: 0.45 }), body, [torsoW * 0.62, legLen + torsoW * 0.15, torsoW * 0.1]);
    }
    if (x === "hat") {
      const hm = std(spec.accent ?? 0xfacc15);
      mesh(new THREE.SphereGeometry(headR * 1.06, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hm, head, [0, headR * 0.22, -headR * 0.03]);
      const brim = mesh(new THREE.CylinderGeometry(headR * 1.25, headR * 1.5, headR * 0.18, 24, 1, true), hm, head, [0, headR * 0.2, 0]);
      brim.material = hm.clone(); brim.material.side = THREE.DoubleSide;
    }
  }

  // phone (shown when held)
  const phone = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.075, 0.155, 0.009), std(0x111827, { roughness: 0.3, metalness: 0.5 }), phone);
  const phoneScreen = mesh(new THREE.PlaneGeometry(0.069, 0.149), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), phone, [0, 0, 0.0052], false);
  phone.visible = false;
  // held in the right hand, screen tilted up toward the face while the arm is raised (see pose holdPhone)
  arms[1].userData.hand.add(phone); phone.position.set(-0.02, -0.06, 0.0); phone.rotation.set(-1.3, 0, 0);

  root.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  const base = { legs, arms, head, body, smile, frown };

  root.userData.phoneScreen = phoneScreen;
  root.userData.setMood = (mood) => {
    const worried = mood === "worried";
    smile.visible = !worried; frown.visible = worried;
    for (const s of [-1, 1]) head.userData[`brow${s}`].rotation.z = worried ? s * -0.35 : 0;
  };
  /** phase: walk cycle radians; walking: bool; opts: { holdPhone, lookUp, wave } */
  root.userData.pose = (phase, walking, opts = {}) => {
    const sw = walking ? Math.sin(phase) : 0;
    legs[0].rotation.x = sw * 0.55; legs[1].rotation.x = -sw * 0.55;
    arms[0].rotation.set(-sw * 0.5, 0, -0.1); arms[1].rotation.set(sw * 0.5, 0, 0.1);
    body.position.y = walking ? Math.abs(Math.cos(phase)) * h * 0.025 : Math.sin(phase * 0.25) * h * 0.004;
    body.rotation.y = walking ? Math.sin(phase) * 0.06 : 0;
    head.rotation.set(walking ? Math.cos(phase * 2) * 0.03 : 0, 0, 0);
    phone.visible = !!opts.holdPhone;
    if (opts.holdPhone) { arms[1].rotation.set(-1.25, 0, 0.32); head.rotation.x = 0.3; }
    if (opts.lookUp) head.rotation.x = -0.15;
    if (opts.wave) arms[0].rotation.set(0, 0, -2.6 + Math.sin(phase * 1.5) * 0.35);
    if (opts.holdHand === "right") arms[1].rotation.set(-0.15, 0, 0.55);
    if (opts.holdHand === "left") arms[0].rotation.set(-0.15, 0, -0.55);
    if (opts.cough) { head.rotation.x = 0.25 * opts.cough; body.rotation.x = 0.12 * opts.cough; }
  };
  root.userData.setMood("happy");
  return root;
}

export function makeFamily() {
  const dad = makePerson({
    h: 1.78, headRatio: 0.11, legRatio: 0.45, skin: 0xe6b48f, hair: 0x1f1a17, hairStyle: "short",
    top: 0x0e7490, collar: 0x0b5d73, sleeves: "short", bottom: 0xc8b38a, bottomStyle: "shorts", shoes: 0xf8fafc, shoeSole: 0x94a3b8,
    belt: 0x3f2a1d, extras: ["glasses", "backpack"],
  });
  const mum = makePerson({
    h: 1.63, headRatio: 0.115, legRatio: 0.45, skin: 0xf0c4a0, hair: 0x2b1b14, hairStyle: "bob", accent: 0xf59e0b,
    top: 0xe85d75, topMat: std(0xffffff, { map: floral("#e85d75", "#fbcfe8") }), sleeves: "short", bottom: 0xe85d75, bottomStyle: "dress", shoes: 0xb45309, extras: ["bag"],
  });
  const girl = makePerson({
    h: 1.22, headRatio: 0.14, legRatio: 0.4, child: true, skin: 0xf0c4a0, hair: 0x2b1b14, hairStyle: "pigtails", accent: 0xf472b6,
    top: 0xfacc15, topMat: std(0xffffff, { map: dots("#facc15", "#ffffff") }), sleeves: "short", bottom: 0xfacc15, bottomStyle: "dress", shoes: 0xec4899, extras: ["kidpack"],
  });
  const boy = makePerson({
    h: 0.92, headRatio: 0.165, legRatio: 0.34, child: true, skin: 0xe9b98e, hair: 0x2b1b14, hairStyle: "tuft",
    top: 0x22c55e, topMat: std(0xffffff, { map: stripes("#22c55e", "#f0fdf4") }), sleeves: "short", bottom: 0x2563eb, bottomStyle: "shorts", shoes: 0xef4444, shoeSole: 0xffffff,
    extras: ["hat"], accent: 0x60a5fa,
  });
  return { dad, mum, girl, boy };
}
