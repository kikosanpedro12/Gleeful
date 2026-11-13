import * as THREE from "three";

/**
 * Procedural stylised teacher (Leo / Mia), built from primitives we own
 * outright — no third-party asset, no licence risk. Proportions and outfits
 * follow TEACHER_DUO_REFERENCE.png; it is still a PLACEHOLDER for a production
 * skinned GLB with facial morph targets, which will plug in behind the same
 * `TeacherRig` joint names. Faces +Z. The character's right side is -X.
 */
export type TeacherId = "leo" | "mia";

export interface TeacherLook {
  id: TeacherId;
  name: string;
  height: number; // overall scale factor
  skin: string;
  skinShade: string;
  hair: string;
  hairStyle: "short_curly" | "wavy_long";
  top: string;
  topShade: string;
  topStyle: "cardigan" | "overshirt";
  shirt: string;
  trousers: string;
  shoes: string;
  iris: string;
  glasses: boolean;
  beard: boolean;
  earrings: boolean;
}

export const LOOKS: Record<TeacherId, TeacherLook> = {
  leo: {
    id: "leo", name: "Leo", height: 1,
    skin: "#c68a5e", skinShade: "#a86f49", hair: "#1c1715", hairStyle: "short_curly",
    top: "#1f6b5f", topShade: "#185449", topStyle: "cardigan", shirt: "#f1e9d8",
    trousers: "#1d2747", shoes: "#f6f6f3", iris: "#4a2a17", glasses: true, beard: true, earrings: false,
  },
  mia: {
    id: "mia", name: "Mia", height: 0.955,
    skin: "#c98f68", skinShade: "#ad7552", hair: "#2b1c16", hairStyle: "wavy_long",
    top: "#e8735a", topShade: "#c95c45", topStyle: "overshirt", shirt: "#f3ead9",
    trousers: "#1d2747", shoes: "#f6f6f3", iris: "#4a2a17", glasses: false, beard: false, earrings: true,
  },
};

export const JOINTS = [
  "hips", "spine", "chest", "neck", "head",
  "shoulderL", "elbowL", "shoulderR", "elbowR",
  "thighL", "kneeL", "thighR", "kneeR",
] as const;
export type JointName = (typeof JOINTS)[number];

export interface TeacherRig {
  look: TeacherLook;
  root: THREE.Group;
  joints: Record<JointName, THREE.Group>;
  handL: THREE.Object3D;
  handR: THREE.Object3D;
  eyeL: THREE.Group;
  eyeR: THREE.Group;
  pupilL: THREE.Object3D;
  pupilR: THREE.Object3D;
  browL: THREE.Object3D;
  browR: THREE.Object3D;
  mouth: THREE.Object3D;
  smile: THREE.Object3D;
  /** Space-helmet bubble: shown on field trips so we never imply people can breathe on Mars. */
  helmet: THREE.Object3D;
  dispose(): void;
}

export function buildTeacher(look: TeacherLook = LOOKS.leo): TeacherRig {
  const disposables: { dispose(): void }[] = [];
  const mat = (color: string, roughness = 0.82, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
    disposables.push(m);
    return m;
  };
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
    disposables.push(geo);
    const o = new THREE.Mesh(geo, m);
    o.castShadow = shadow;
    return o;
  };
  const group = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const at = <T extends THREE.Object3D>(o: T, parent: THREE.Object3D, x: number, y: number, z: number) => {
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };

  const skin = mat(look.skin, 0.62), skinShade = mat(look.skinShade, 0.7);
  const top = mat(look.top, 0.95), topShade = mat(look.topShade, 0.95), shirt = mat(look.shirt, 0.92);
  const trousers = mat(look.trousers, 0.88), shoes = mat(look.shoes, 0.55), sole = mat("#d9d6cf", 0.7);
  const hair = mat(look.hair, 0.75);
  const white = mat("#ffffff", 0.3), irisM = mat(look.iris, 0.4), black = mat("#120a07", 0.3);
  const mouthMat = mat("#6a2622", 0.6), lip = mat("#9a4f45", 0.6), button = mat("#3a2a20", 0.5);

  const root = new THREE.Group();
  root.name = `teacher_${look.id}`;
  const body = group(root);
  body.scale.setScalar(look.height);

  // ---------------------------------------------------------------- legs
  const hips = group(body, 0, 0.93, 0);
  const pelvis = at(mesh(new THREE.CapsuleGeometry(0.145, 0.1, 6, 16), trousers), hips, 0, -0.03, 0);
  pelvis.rotation.z = Math.PI / 2;
  pelvis.scale.set(1, 1.02, 0.78);

  const leg = (side: 1 | -1) => {
    const thigh = group(hips, 0.092 * side, -0.05, 0);
    at(mesh(new THREE.CapsuleGeometry(0.077, 0.3, 6, 14), trousers), thigh, 0, -0.2, 0);
    const knee = group(thigh, 0, -0.41, 0);
    const shin = at(mesh(new THREE.CapsuleGeometry(0.066, 0.3, 6, 14), trousers), knee, 0, -0.19, 0);
    shin.scale.set(1, 1, 0.95);
    // Sneaker: upper + sole + toe cap
    const shoe = at(mesh(new THREE.CapsuleGeometry(0.062, 0.12, 6, 14), shoes), knee, 0, -0.445, 0.045);
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.set(1.05, 1, 0.82);
    const s = at(mesh(new THREE.BoxGeometry(0.125, 0.025, 0.27), sole), knee, 0, -0.493, 0.045);
    s.castShadow = true;
    return { thigh, knee };
  };
  const legL = leg(1), legR = leg(-1);

  // ---------------------------------------------------------------- torso
  const spine = group(hips, 0, 0.04, 0);
  const belly = at(mesh(new THREE.CapsuleGeometry(0.158, 0.12, 6, 18), top), spine, 0, 0.12, 0);
  belly.scale.set(1, 1, 0.76);
  const chest = group(spine, 0, 0.26, 0);
  const ribs = at(mesh(new THREE.CapsuleGeometry(0.175, 0.15, 6, 18), top), chest, 0, 0.1, 0);
  ribs.scale.set(1.06, 1, 0.74);
  // Hem band
  const hem = at(mesh(new THREE.CylinderGeometry(0.165, 0.168, 0.06, 22, 1, true), topShade), spine, 0, 0.0, 0);
  hem.scale.set(1, 1, 0.8);

  const frontZ = 0.128;
  if (look.topStyle === "cardigan") {
    // V-neck showing the shirt, buttons below, two patch pockets.
    const v = new THREE.Shape();
    v.moveTo(-0.075, 0.23); v.lineTo(0.075, 0.23); v.lineTo(0.0, 0.02); v.closePath();
    const vMesh = at(mesh(new THREE.ShapeGeometry(v), shirt, false), chest, 0, 0, frontZ + 0.005);
    vMesh.rotation.x = -0.12;
    for (let i = 0; i < 4; i++) at(mesh(new THREE.SphereGeometry(0.011, 8, 6), button, false), chest, 0.006, -0.0 - i * 0.075, frontZ + 0.012);
    for (const side of [1, -1]) {
      const p = at(mesh(new THREE.BoxGeometry(0.085, 0.075, 0.012), topShade, false), spine, 0.085 * side, 0.07, 0.122);
      p.rotation.y = 0.28 * side;
    }
  } else {
    // Open overshirt: tee visible as a full-height strip, collar points, chest pocket.
    at(mesh(new THREE.BoxGeometry(0.13, 0.5, 0.02), shirt, false), chest, 0, -0.06, frontZ + 0.002);
    for (const side of [1, -1]) {
      const c = at(mesh(new THREE.BoxGeometry(0.075, 0.05, 0.012), topShade, false), chest, 0.06 * side, 0.235, frontZ + 0.01);
      c.rotation.z = 0.55 * side;
      const edge = at(mesh(new THREE.BoxGeometry(0.014, 0.48, 0.016), topShade, false), chest, 0.07 * side, -0.05, frontZ + 0.006);
      edge.rotation.z = 0.04 * side;
    }
    at(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.01), topShade, false), chest, -0.1, 0.12, 0.122);
  }
  at(mesh(new THREE.CylinderGeometry(0.07, 0.095, 0.05, 18), shirt, false), chest, 0, 0.27, 0);

  // ---------------------------------------------------------------- arms
  const arm = (side: 1 | -1) => {
    const shoulder = group(chest, 0.21 * side, 0.2, 0);
    at(mesh(new THREE.SphereGeometry(0.074, 16, 12), top), shoulder, 0, 0, 0);
    at(mesh(new THREE.CapsuleGeometry(0.058, 0.2, 6, 14), top), shoulder, 0, -0.14, 0);
    const elbow = group(shoulder, 0, -0.28, 0);
    const rolled = look.topStyle === "overshirt";
    // Overshirt sleeves are rolled: bare forearm + a thick cuff at the elbow.
    at(mesh(new THREE.CapsuleGeometry(rolled ? 0.044 : 0.05, 0.19, 6, 14), rolled ? skin : top), elbow, 0, -0.125, 0);
    const cuff = at(mesh(new THREE.TorusGeometry(rolled ? 0.056 : 0.048, rolled ? 0.018 : 0.012, 8, 18), topShade, false), elbow, 0, rolled ? -0.02 : -0.23, 0);
    cuff.rotation.x = Math.PI / 2;
    // Hand: palm + mitten fingers + thumb
    const hand = at(mesh(new THREE.SphereGeometry(0.05, 14, 12), skin), elbow, 0, -0.275, 0);
    hand.scale.set(0.85, 1.05, 0.55);
    const fingers = at(mesh(new THREE.CapsuleGeometry(0.036, 0.04, 6, 10), skin), elbow, 0, -0.325, 0.002);
    fingers.scale.set(1.05, 1, 0.55);
    const thumb = at(mesh(new THREE.CapsuleGeometry(0.014, 0.035, 4, 8), skin, false), elbow, -0.034 * side, -0.27, 0.02);
    thumb.rotation.z = 0.5 * side;
    return { shoulder, elbow, hand };
  };
  const armL = arm(1), armR = arm(-1);

  // ---------------------------------------------------------------- head
  const neck = group(chest, 0, 0.28, 0);
  at(mesh(new THREE.CylinderGeometry(0.048, 0.054, 0.1, 14), skin), neck, 0, 0.03, 0);
  const head = group(neck, 0, 0.07, 0);
  const skull = at(mesh(new THREE.SphereGeometry(0.15, 32, 24), skin), head, 0, 0.145, 0.002);
  skull.scale.set(0.93, 1.1, 0.97);
  // Jaw/chin softening
  const jaw = at(mesh(new THREE.SphereGeometry(0.1, 20, 14), skin), head, 0, 0.075, 0.03);
  jaw.scale.set(1.05, 0.8, 1);
  for (const side of [1, -1]) {
    const ear = at(mesh(new THREE.SphereGeometry(0.03, 12, 10), skinShade, false), head, 0.142 * side, 0.135, -0.005);
    ear.scale.set(0.45, 1, 0.75);
  }
  const nose = at(mesh(new THREE.SphereGeometry(0.02, 12, 10), skinShade, false), head, 0, 0.118, 0.152);
  nose.scale.set(1.1, 1, 0.9);

  // Eyes: group scales in Y to blink; pupil group (iris + pupil + catchlight) slides for gaze.
  const eye = (side: 1 | -1) => {
    const g = group(head, 0.054 * side, 0.162, 0.123);
    const sclera = at(mesh(new THREE.SphereGeometry(0.03, 18, 14), white, false), g, 0, 0, 0);
    sclera.scale.set(1, 1.12, 0.55);
    const pupil = group(g, 0, 0, 0.012);
    const iris = at(mesh(new THREE.SphereGeometry(0.019, 16, 12), irisM, false), pupil, 0, 0, 0);
    iris.scale.set(1, 1.08, 0.35);
    const p = at(mesh(new THREE.SphereGeometry(0.0095, 12, 10), black, false), pupil, 0, 0, 0.004);
    p.scale.set(1, 1, 0.4);
    at(mesh(new THREE.SphereGeometry(0.0045, 8, 6), white, false), pupil, 0.006, 0.007, 0.007);
    // Upper lid line (gives the eye shape and reads well at distance)
    const lid = at(mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 16, Math.PI), hair, false), g, 0, 0.004, 0.004);
    lid.scale.set(1, 1.15, 1);
    const brow = at(mesh(new THREE.CapsuleGeometry(0.008, 0.042, 4, 8), hair, false), head, 0.056 * side, 0.212, 0.14);
    brow.rotation.z = Math.PI / 2 - 0.12 * side;
    return { g, pupil, brow };
  };
  const eL = eye(1), eR = eye(-1);

  if (look.glasses) {
    const frame = mat("#2a2a2e", 0.35, { metalness: 0.2 });
    for (const side of [1, -1]) {
      at(mesh(new THREE.TorusGeometry(0.041, 0.0042, 8, 32), frame, false), head, 0.055 * side, 0.162, 0.147);
      const temple = at(mesh(new THREE.BoxGeometry(0.004, 0.004, 0.13), frame, false), head, 0.096 * side, 0.168, 0.085);
      temple.rotation.y = -0.18 * side;
    }
    at(mesh(new THREE.BoxGeometry(0.03, 0.004, 0.004), frame, false), head, 0, 0.168, 0.15);
  }
  if (look.earrings) {
    const gold = mat("#d9a441", 0.3, { metalness: 0.7 });
    for (const side of [1, -1]) at(mesh(new THREE.TorusGeometry(0.012, 0.003, 6, 14), gold, false), head, 0.145 * side, 0.095, 0.01);
  }
  if (look.beard) {
    // Short beard + moustache: a shell over the lower face in a stubble tone.
    const stubble = mat("#4a3226", 0.95);
    const b = at(mesh(new THREE.SphereGeometry(0.106, 24, 16, Math.PI / 2 - 1.25, 2.5, Math.PI * 0.52, Math.PI * 0.36), stubble, false), head, 0, 0.076, 0.034);
    b.scale.set(1.06, 0.86, 1.04);
    const moustache = at(mesh(new THREE.CapsuleGeometry(0.01, 0.045, 4, 8), stubble, false), head, 0, 0.094, 0.143);
    moustache.rotation.z = Math.PI / 2;
  }

  // Mouth: open shape (driven by voice loudness) + resting smile.
  const mouth = at(mesh(new THREE.SphereGeometry(0.028, 18, 12), mouthMat, false), head, 0, 0.068, 0.14);
  mouth.scale.set(1, 0.08, 0.35);
  const smile = at(mesh(new THREE.TorusGeometry(0.03, 0.0055, 6, 18, Math.PI * 0.7), lip, false), head, 0, 0.09, 0.141);
  smile.rotation.z = Math.PI + (Math.PI * 0.3) / 2;

  // ---------------------------------------------------------------- hair
  if (look.hairStyle === "short_curly") {
    const cap = at(mesh(new THREE.SphereGeometry(0.158, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), hair), head, 0, 0.17, -0.01);
    cap.scale.set(0.97, 1.0, 1.03);
    cap.rotation.x = -0.3;
    // Curls: deterministic cluster on top and front.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = 0.04 + rnd() * 0.1;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.9 + 0.005;
      const y = 0.29 + (0.11 - r) * 0.5 + rnd() * 0.015;
      at(mesh(new THREE.SphereGeometry(0.03 + rnd() * 0.015, 10, 8), hair, false), head, x, y, z);
    }
    for (const side of [1, -1]) {
      const sb = at(mesh(new THREE.BoxGeometry(0.018, 0.06, 0.03), hair, false), head, 0.137 * side, 0.15, 0.03);
      sb.rotation.y = 0.2 * side;
    }
  } else {
    const cap = at(mesh(new THREE.SphereGeometry(0.162, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hair), head, 0, 0.165, -0.008);
    cap.rotation.x = -0.32;
    cap.rotation.z = 0.08; // side part
    // Volume: waves around the back and sides, down to the shoulders, face kept clear.
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let ring = 0; ring < 5; ring++) {
      const y = 0.2 - ring * 0.065;
      const radius = 0.155 + ring * 0.012;
      const n = 11;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI * 0.62 + (i / (n - 1)) * Math.PI * 1.24 + Math.PI; // back half + sides
        const x = Math.sin(a) * radius * 1.05;
        const z = Math.cos(a) * radius * 0.95 - 0.02;
        const s = 0.05 + rnd() * 0.018 + ring * 0.004;
        at(mesh(new THREE.SphereGeometry(s, 10, 8), hair, false), head, x, y + Math.sin(i * 1.7 + ring) * 0.012, z);
      }
    }
    // Front side locks framing the face
    for (const side of [1, -1]) {
      for (let k = 0; k < 4; k++) {
        at(mesh(new THREE.SphereGeometry(0.042 - k * 0.002, 10, 8), hair, false), head, (0.14 + k * 0.012) * side, 0.2 - k * 0.07, 0.05 - k * 0.012);
      }
    }
    const fringe = at(mesh(new THREE.SphereGeometry(0.07, 14, 10), hair, false), head, -0.06, 0.27, 0.085);
    fringe.scale.set(1.4, 0.55, 0.8);
  }

  // Cheek warmth
  const blush = mat("#e0857a", 0.9, { transparent: true, opacity: 0.22, depthWrite: false });
  for (const side of [1, -1]) {
    const c = at(mesh(new THREE.SphereGeometry(0.024, 10, 8), blush, false), head, 0.085 * side, 0.112, 0.118);
    c.scale.set(1, 0.7, 0.4);
  }

  // ---------------------------------------------------------------- helmet (field trips)
  const helmet = group(head, 0, 0.14, 0.005);
  const glass = mat("#eef8ff", 0.05, { transparent: true, opacity: 0.14, depthWrite: false, metalness: 0.05, emissive: "#9fc6e6", emissiveIntensity: 0.25 });
  at(mesh(new THREE.SphereGeometry(0.265, 32, 24), glass, false), helmet, 0, 0, 0);
  // Fresnel rim: the bubble's edge glows, so the helmet reads clearly at phone size
  // (clear in the middle so the face stays visible). A fixed shader, no runtime code.
  const rim = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { tint: { value: new THREE.Color("#dff1ff") } },
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: "uniform vec3 tint; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(tint, clamp(f * 0.95, 0.0, 0.85)); }",
  });
  disposables.push(rim);
  at(mesh(new THREE.SphereGeometry(0.268, 32, 24), rim, false), helmet, 0, 0, 0);
  const ringM = mat("#e9edf2", 0.4, { metalness: 0.3 });
  const ring = at(mesh(new THREE.TorusGeometry(0.18, 0.034, 12, 32), ringM, false), helmet, 0, -0.2, 0);
  ring.rotation.x = Math.PI / 2;
  const shine = mat("#ffffff", 0.1, { transparent: true, opacity: 0.6, depthWrite: false, emissive: "#ffffff", emissiveIntensity: 0.6 });
  const s = at(mesh(new THREE.SphereGeometry(0.04, 10, 8), shine, false), helmet, -0.12, 0.13, 0.19);
  s.scale.set(1, 1.8, 0.3);
  helmet.visible = false;

  return {
    look,
    root,
    joints: {
      hips, spine, chest, neck, head,
      shoulderL: armL.shoulder, elbowL: armL.elbow, shoulderR: armR.shoulder, elbowR: armR.elbow,
      thighL: legL.thigh, kneeL: legL.knee, thighR: legR.thigh, kneeR: legR.knee,
    },
    handL: armL.hand, handR: armR.hand,
    eyeL: eL.g, eyeR: eR.g, pupilL: eL.pupil, pupilR: eR.pupil, browL: eL.brow, browR: eR.brow,
    mouth, smile, helmet,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
