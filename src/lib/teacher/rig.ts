import * as THREE from "three";

/**
 * Procedural placeholder teacher. A real jointed body (hips, spine, chest,
 * neck, head, shoulders, elbows, hands, thighs, knees, feet, eyes, brows,
 * mouth) built from primitives we own outright — no third-party asset, no
 * license risk. It is NOT the production character: a skinned GLB with facial
 * morph targets replaces it behind the same `TeacherRig` joint names.
 * Faces +Z. The character's right side is -X.
 */
export interface TeacherLook {
  skin: string; hair: string; top: string; shirt: string; trousers: string; shoes: string; glasses: boolean;
}

export const LEO_LOOK: TeacherLook = {
  skin: "#c98d62", hair: "#1d1a19", top: "#1f6f63", shirt: "#f2ead9", trousers: "#1e2a4a", shoes: "#f5f5f2", glasses: true,
};

export const JOINTS = [
  "hips", "spine", "chest", "neck", "head",
  "shoulderL", "elbowL", "shoulderR", "elbowR",
  "thighL", "kneeL", "thighR", "kneeR",
] as const;
export type JointName = (typeof JOINTS)[number];

export interface TeacherRig {
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
  dispose(): void;
}

export function buildTeacher(look: TeacherLook = LEO_LOOK): TeacherRig {
  const disposables: { dispose(): void }[] = [];
  const mat = (color: string, roughness = 0.82) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
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

  const skin = mat(look.skin, 0.7), top = mat(look.top, 0.95), shirt = mat(look.shirt, 0.9);
  const trousers = mat(look.trousers, 0.9), shoes = mat(look.shoes, 0.6), hair = mat(look.hair, 0.9);
  const white = mat("#ffffff", 0.35), dark = mat("#22140f", 0.5), mouthMat = mat("#5a1f1c", 0.6);

  const root = new THREE.Group();
  root.name = "teacher";
  const hips = group(root, 0, 0.93, 0);
  const pelvis = mesh(new THREE.CapsuleGeometry(0.15, 0.1, 6, 14), trousers);
  pelvis.rotation.z = Math.PI / 2;
  pelvis.scale.set(1, 1, 0.8);
  pelvis.position.y = -0.02;
  hips.add(pelvis);

  // Legs
  const leg = (side: 1 | -1) => {
    const thigh = group(hips, 0.095 * side, -0.05, 0);
    const t = mesh(new THREE.CapsuleGeometry(0.078, 0.3, 6, 12), trousers);
    t.position.y = -0.2;
    thigh.add(t);
    const knee = group(thigh, 0, -0.41, 0);
    const s = mesh(new THREE.CapsuleGeometry(0.066, 0.3, 6, 12), trousers);
    s.position.y = -0.2;
    knee.add(s);
    const foot = mesh(new THREE.CapsuleGeometry(0.06, 0.13, 6, 12), shoes);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, -0.455, 0.05);
    knee.add(foot);
    return { thigh, knee };
  };
  const legL = leg(1), legR = leg(-1);

  // Torso
  const spine = group(hips, 0, 0.04, 0);
  const belly = mesh(new THREE.CapsuleGeometry(0.165, 0.12, 6, 16), top);
  belly.scale.set(1, 1, 0.78);
  belly.position.y = 0.12;
  spine.add(belly);
  const chest = group(spine, 0, 0.26, 0);
  const ribs = mesh(new THREE.CapsuleGeometry(0.18, 0.14, 6, 16), top);
  ribs.scale.set(1.05, 1, 0.76);
  ribs.position.y = 0.1;
  chest.add(ribs);
  // Shirt showing under the open cardigan
  const placket = mesh(new THREE.BoxGeometry(0.11, 0.5, 0.02), shirt, false);
  placket.position.set(0, -0.04, 0.136);
  chest.add(placket);
  const collar = mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.05, 16), shirt, false);
  collar.position.y = 0.27;
  chest.add(collar);

  // Arms
  const arm = (side: 1 | -1) => {
    const shoulder = group(chest, 0.215 * side, 0.2, 0);
    const cap = mesh(new THREE.SphereGeometry(0.075, 14, 12), top);
    shoulder.add(cap);
    const u = mesh(new THREE.CapsuleGeometry(0.058, 0.2, 6, 12), top);
    u.position.y = -0.14;
    shoulder.add(u);
    const elbow = group(shoulder, 0, -0.28, 0);
    const f = mesh(new THREE.CapsuleGeometry(0.05, 0.19, 6, 12), top);
    f.position.y = -0.125;
    elbow.add(f);
    const hand = mesh(new THREE.SphereGeometry(0.055, 14, 12), skin);
    hand.scale.set(0.85, 1.15, 0.6);
    hand.position.y = -0.285;
    elbow.add(hand);
    const thumb = mesh(new THREE.CapsuleGeometry(0.014, 0.03, 4, 8), skin, false);
    thumb.position.set(-0.03 * side, -0.27, 0.03);
    elbow.add(thumb);
    return { shoulder, elbow, hand };
  };
  const armL = arm(1), armR = arm(-1);

  // Neck + head
  const neck = group(chest, 0, 0.28, 0);
  const neckMesh = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.09, 12), skin);
  neckMesh.position.y = 0.03;
  neck.add(neckMesh);
  const head = group(neck, 0, 0.07, 0);
  const skull = mesh(new THREE.SphereGeometry(0.155, 28, 22), skin);
  skull.scale.set(0.95, 1.08, 0.98);
  skull.position.y = 0.14;
  head.add(skull);
  const ear = (side: 1 | -1) => {
    const e = mesh(new THREE.SphereGeometry(0.032, 10, 8), skin, false);
    e.scale.set(0.5, 1, 0.8);
    e.position.set(0.148 * side, 0.13, 0);
    head.add(e);
  };
  ear(1); ear(-1);
  // Hair: cap + front tuft
  const cap = mesh(new THREE.SphereGeometry(0.163, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), hair);
  cap.scale.set(0.98, 1.05, 1.02);
  cap.position.set(0, 0.165, -0.012);
  cap.rotation.x = -0.28;
  head.add(cap);
  for (const [x, y, z, r] of [[-0.06, 0.295, 0.06, 0.06], [0.03, 0.305, 0.07, 0.065], [0.09, 0.285, 0.04, 0.05], [-0.1, 0.27, 0.02, 0.05]] as const) {
    const tuft = mesh(new THREE.SphereGeometry(r, 10, 8), hair, false);
    tuft.position.set(x, y, z);
    head.add(tuft);
  }
  const nose = mesh(new THREE.SphereGeometry(0.022, 10, 8), skin, false);
  nose.position.set(0, 0.12, 0.152);
  head.add(nose);

  // Eyes: group scales in Y to blink; pupil slides for gaze.
  const eye = (side: 1 | -1) => {
    const g = group(head, 0.058 * side, 0.165, 0.128);
    const ball = mesh(new THREE.SphereGeometry(0.031, 16, 12), white, false);
    ball.scale.set(1, 1.1, 0.5);
    g.add(ball);
    const pupil = mesh(new THREE.SphereGeometry(0.017, 12, 10), dark, false);
    pupil.scale.set(1, 1, 0.4);
    pupil.position.z = 0.014;
    g.add(pupil);
    const brow = mesh(new THREE.BoxGeometry(0.052, 0.011, 0.012), hair, false);
    brow.position.set(0.058 * side, 0.215, 0.142);
    brow.rotation.z = -0.1 * side;
    head.add(brow);
    return { g, pupil, brow };
  };
  const eL = eye(1), eR = eye(-1);

  if (look.glasses) {
    const frame = mat("#2b2b30", 0.4);
    for (const side of [1, -1]) {
      const ring = mesh(new THREE.TorusGeometry(0.042, 0.0045, 8, 28), frame, false);
      ring.position.set(0.058 * side, 0.165, 0.146);
      head.add(ring);
    }
    const bridge = mesh(new THREE.BoxGeometry(0.03, 0.005, 0.005), frame, false);
    bridge.position.set(0, 0.168, 0.148);
    head.add(bridge);
  }

  // Mouth: open shape (scaled by voice loudness) + resting smile.
  const mouth = mesh(new THREE.SphereGeometry(0.03, 16, 10), mouthMat, false);
  mouth.scale.set(1, 0.08, 0.3);
  mouth.position.set(0, 0.066, 0.139);
  head.add(mouth);
  const smile = mesh(new THREE.TorusGeometry(0.034, 0.0045, 6, 16, Math.PI * 0.7), mouthMat, false);
  smile.rotation.z = Math.PI + (Math.PI * 0.3) / 2;
  smile.position.set(0, 0.092, 0.142);
  head.add(smile);

  return {
    root,
    joints: {
      hips, spine, chest, neck, head,
      shoulderL: armL.shoulder, elbowL: armL.elbow, shoulderR: armR.shoulder, elbowR: armR.elbow,
      thighL: legL.thigh, kneeL: legL.knee, thighR: legR.thigh, kneeR: legR.knee,
    },
    handL: armL.hand, handR: armR.hand,
    eyeL: eL.g, eyeR: eR.g, pupilL: eL.pupil, pupilR: eR.pupil, browL: eL.brow, browR: eR.brow,
    mouth, smile,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
