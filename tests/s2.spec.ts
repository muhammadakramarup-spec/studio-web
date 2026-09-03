// S2 — Editor. Vite serves TypeScript directly; every check below runs the real src/editor/**
// module inside the page via dynamic import, per SCOPE.md's testing instructions. Ownership:
// S2 owns this file exclusively (DECISIONS.md #20).
//
// Per HANDOFF: S2 builds against S1's frozen StudioHandle shape without importing src/viewer/**.
// Every test constructs its own minimal local three scene satisfying the same shape (a Scene, a
// PerspectiveCamera, a WebGLRenderer, a canvas, and a setRenderHook stub) — assembly wires the
// real StudioHandle in Wave 3.

import { test, expect } from "@playwright/test";
import type * as THREE_TYPES from "three";

// tsconfig.json's path mapping covers the bare "three" specifier (via @types/three) and
// examples/jsm/*, but not the direct ESM build path used for in-page dynamic import (Vite serves
// and transforms it like any other module — see the comment above the first test). Each
// `await import("/node_modules/three/build/three.module.js") as unknown as ThreeNS` below casts
// to this type so the block is fully typed against three's real .d.ts without needing a
// declaration file for that literal path.
type ThreeNS = typeof THREE_TYPES;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

// ===========================================================================================
// Target 1a — isolation gate: the undo/redo stack built and tested BEFORE anything else is
// wired through it (HANDOFF build order item 1), against a single trivial transform op.
// ===========================================================================================
test("1a. history stack in isolation: execute/undo/redo a trivial op with no editor wiring", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createHistory } = await import("/src/editor/history.ts");
    const history = createHistory();
    const state = { x: 0 };
    const op = {
      id: "t1",
      kind: "transform" as const,
      label: "x=5",
      do: () => {
        state.x = 5;
      },
      undo: () => {
        state.x = 0;
      },
    };
    history.execute(op);
    const afterExecute = state.x;
    const undoOk = history.undo();
    const afterUndo = state.x;
    const redoOk = history.redo();
    const afterRedo = state.x;
    const undoWhenEmpty = history.undo() === false; // stack was popped already, then redone -> depth 0 again after this call? check depths instead
    return { afterExecute, undoOk, afterUndo, redoOk, afterRedo, undoDepth: history.undoDepth, redoDepth: history.redoDepth, undoWhenEmptyAfterThis: undoWhenEmpty };
  });
  console.log(`MEASURED history-isolation: afterExecute=${result.afterExecute} afterUndo=${result.afterUndo} afterRedo=${result.afterRedo}`);
  expect(result.afterExecute).toBe(5);
  expect(result.undoOk).toBe(true);
  expect(result.afterUndo).toBe(0);
  expect(result.redoOk).toBe(true);
  expect(result.afterRedo).toBe(5);
});

// ===========================================================================================
// Target 1 — SCOPE.md §1: "Undo/redo: canonical serialization (hierarchy, types, visibility,
// transforms, materials, modifier params, post-FX state) round-trips exactly after 50 ops undo
// and 50 redo."
// ===========================================================================================
test("1. undo/redo: 50-op canonical-state round trip (undo x50, redo x50)", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const THREE_MODULE_PATH = "/node_modules/three/build/three.module.js";
    const THREE = (await import(THREE_MODULE_PATH)) as unknown as ThreeNS;
    const { attachEditor } = await import("/src/editor/index.ts");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(256, 256, true);

    let hook: ((dt: number) => void) | null = null;
    const studio = {
      scene,
      camera,
      renderer,
      controls: { enabled: true },
      setRenderHook(fn: ((dt: number) => void) | null) {
        hook = fn;
      },
    };

    const editor = attachEditor(studio as any) as any;
    const t = editor.__test;

    // Seed one mesh so transform/material/mirror/array ops have a target from op #1 onward.
    const seed = editor.ops.add({ kind: "primitive-box" });

    // Deterministic PRNG (mulberry32) — SPEC risk-1 fallback: "a fixed deterministic 50-op
    // sequence... still 50, still round-tripped" if true randomness doesn't stabilize; a seeded
    // PRNG gives both a fixed, reproducible sequence AND genuine op-kind/parameter variety.
    let seedState = 0xC0FFEE;
    function rand(): number {
      seedState |= 0;
      seedState = (seedState + 0x6d2b79f5) | 0;
      let x = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    }
    function pick<T>(arr: T[]): T {
      return arr[Math.floor(rand() * arr.length)];
    }

    const pool: Array<{ obj: any; isMesh: boolean }> = [{ obj: seed, isMesh: true }];
    const kinds = ["add", "remove", "transform", "material", "mirror", "array", "postfx"] as const;

    const before = t.serializeState();

    for (let i = 0; i < 50; i++) {
      const meshPool = pool.filter((p) => p.isMesh);
      let kind = pick(kinds as unknown as string[]);
      if (pool.length === 0) kind = "add";
      if ((kind === "remove" || kind === "transform") && pool.length === 0) kind = "add";
      if ((kind === "material" || kind === "mirror" || kind === "array") && meshPool.length === 0) kind = "add";

      if (kind === "add") {
        const addKinds = ["primitive-box", "primitive-sphere", "light-point", "camera"] as const;
        const k = pick(addKinds as unknown as string[]);
        const obj = editor.ops.add({ kind: k, at: [rand() * 4 - 2, rand() * 4 - 2, 0] });
        pool.push({ obj, isMesh: k.startsWith("primitive") });
      } else if (kind === "remove") {
        const idx = Math.floor(rand() * pool.length);
        const entry = pool[idx];
        editor.ops.remove(entry.obj);
        pool.splice(idx, 1);
      } else if (kind === "transform") {
        const entry = pick(pool);
        editor.ops.setTransform(entry.obj, { position: [rand() * 4 - 2, rand() * 4 - 2, rand() * 4 - 2] });
      } else if (kind === "material") {
        const entry = pick(meshPool);
        editor.ops.setMaterial(entry.obj, { roughness: rand(), metalness: rand(), color: 0xffffff * rand() });
      } else if (kind === "mirror") {
        const entry = pick(meshPool);
        editor.ops.setMirror(entry.obj, pick(["x", "y", "z"]), rand() > 0.5);
      } else if (kind === "array") {
        const entry = pick(meshPool);
        editor.ops.setArray(entry.obj, 1 + Math.floor(rand() * 4), [1.2, 0, 0]);
      } else if (kind === "postfx") {
        editor.ops.setPostFX({ bloom: { enabled: rand() > 0.5, strength: rand() * 2, radius: rand(), threshold: rand() } });
      }
    }

    const afterOps = t.serializeState();

    let undoCount = 0;
    for (let i = 0; i < 50; i++) if (editor.undo()) undoCount++;
    const afterUndo = t.serializeState();
    const undoMatchesInitial = t.statesEqual(before, afterUndo, 1e-5);

    let redoCount = 0;
    for (let i = 0; i < 50; i++) if (editor.redo()) redoCount++;
    const afterRedo = t.serializeState();
    const redoMatchesPreUndo = t.statesEqual(afterOps, afterRedo, 1e-5);

    return {
      undoCount,
      redoCount,
      undoMatchesInitial,
      redoMatchesPreUndo,
      initialObjCount: before.objects.length,
      afterOpsObjCount: afterOps.objects.length,
    };
  });

  console.log(
    `MEASURED undo-redo-50: undoCount=${result.undoCount} redoCount=${result.redoCount} undoMatchesInitial=${result.undoMatchesInitial} redoMatchesPreUndo=${result.redoMatchesPreUndo} initialObjs=${result.initialObjCount} afterOpsObjs=${result.afterOpsObjCount}`,
  );
  expect(result.undoCount).toBe(50);
  expect(result.redoCount).toBe(50);
  expect(result.undoMatchesInitial).toBe(true);
  expect(result.redoMatchesPreUndo).toBe(true);
});

// ===========================================================================================
// Target 2 (review-replaced) — fixed fixture: 3 separated meshes + 1 light + 1 camera. Outliner
// UUID set 5/5, each row selects its UUID 5/5, 3 fixed canvas coords select their mesh 3/3, 1
// blank coord returns null.
// ===========================================================================================
test("2. selection: outliner 5/5, row-select 5/5, canvas-pick 3/3, blank -> null", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const THREE_MODULE_PATH = "/node_modules/three/build/three.module.js";
    const THREE = (await import(THREE_MODULE_PATH)) as unknown as ThreeNS;
    const { attachEditor } = await import("/src/editor/index.ts");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 6);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(512, 512, true);

    const studio = {
      scene,
      camera,
      renderer,
      controls: { enabled: true },
      setRenderHook(_fn: any) {},
    };

    // Fixed fixture, built directly (not via ops) so uuids/positions are pinned.
    const meshMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), meshMat);
    meshA.position.set(-2, 0, 0);
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), meshMat);
    meshB.position.set(0, 0, 0);
    const meshC = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), meshMat);
    meshC.position.set(2, 0, 0);
    const light = new THREE.PointLight(0xffffff, 5);
    light.position.set(0, 3, 3);
    const cam2 = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    cam2.position.set(0, 2, 0);
    scene.add(meshA, meshB, meshC, light, cam2);

    const editor = attachEditor(studio as any) as any;
    renderer.render(scene, camera);

    const rows = editor.outliner.list();
    const expectedUuids = new Set([meshA.uuid, meshB.uuid, meshC.uuid, light.uuid, cam2.uuid]);
    const rowUuids = new Set(rows.map((r: any) => r.id));
    const outlinerSetMatches =
      rowUuids.size === 5 && [...expectedUuids].every((u) => rowUuids.has(u)) && rows.length === 5;

    let rowSelectHits = 0;
    for (const row of rows) {
      editor.select(row.object);
      if (editor.selection === row.object) rowSelectHits++;
    }
    editor.select(null);

    function project(obj: any) {
      const v = obj.position.clone().project(camera);
      const rect = canvas.getBoundingClientRect();
      return {
        clientX: rect.left + ((v.x + 1) / 2) * rect.width,
        clientY: rect.top + ((1 - v.y) / 2) * rect.height,
      };
    }

    function clickAt(clientX: number, clientY: number) {
      canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX, clientY, button: 0, bubbles: true }));
    }

    let canvasPickHits = 0;
    for (const mesh of [meshA, meshB, meshC]) {
      editor.select(null);
      const { clientX, clientY } = project(mesh);
      clickAt(clientX, clientY);
      if (editor.selection === mesh) canvasPickHits++;
    }

    // Blank coordinate: corner of the canvas, well away from all three boxes.
    editor.select(meshA);
    const rect = canvas.getBoundingClientRect();
    clickAt(rect.left + 5, rect.top + 5);
    const blankReturnsNull = editor.selection === null;

    return { outlinerSetMatches, rowSelectHits, rowCount: rows.length, canvasPickHits, blankReturnsNull };
  });

  console.log(
    `MEASURED selection: outlinerSetMatches=${result.outlinerSetMatches} rowSelectHits=${result.rowSelectHits}/5 canvasPickHits=${result.canvasPickHits}/3 blankReturnsNull=${result.blankReturnsNull}`,
  );
  expect(result.outlinerSetMatches).toBe(true);
  expect(result.rowSelectHits).toBe(5);
  expect(result.canvasPickHits).toBe(3);
  expect(result.blankReturnsNull).toBe(true);
});

// ===========================================================================================
// Target 3 — TransformControls gizmo: synthetic drag on translate/rotate/scale, each checked
// against an independent ray/plane oracle (same plane math TransformControls itself uses, built
// from THREE's own generic Raycaster/Plane primitives — not a call into the control under test)
// for "delta within ±1e-3", plus a canvas changed() check.
// ===========================================================================================
test("3. gizmo: translate/rotate/scale deltas within 1e-3 of an independent oracle + canvas changed()", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const THREE_MODULE_PATH = "/node_modules/three/build/three.module.js";
    const THREE = (await import(THREE_MODULE_PATH)) as unknown as ThreeNS;
    const { attachEditor } = await import("/src/editor/index.ts");

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 3));
    const dl = new THREE.DirectionalLight(0xffffff, 2);
    dl.position.set(2, 3, 4);
    scene.add(dl);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5); // identity rotation: looking straight down -Z at the origin
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(512, 512, true);

    let hook: ((dt: number) => void) | null = null;
    const studio = {
      scene,
      camera,
      renderer,
      controls: { enabled: true },
      setRenderHook(fn: any) {
        hook = fn;
      },
    };
    const editor = attachEditor(studio as any) as any;
    const gizmo = editor.__test.gizmo;

    function snap(): Uint8ClampedArray {
      renderer.render(scene, camera);
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const ctx = off.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      return ctx.getImageData(0, 0, off.width, off.height).data;
    }
    function diffMoved(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
      const n = a.length / 4;
      let moved = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        let pmax = 0;
        for (let c = 0; c < 3; c++) pmax = Math.max(pmax, Math.abs(a[o + c] - b[o + c]));
        if (pmax > 2) moved++;
      }
      return (moved / n) * 100;
    }

    // Independent oracle: same plane definition TransformControls uses for this exact camera
    // (identity rotation, looking down -Z) via THREE's generic Raycaster/Plane, not a call into
    // the control under test.
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    function ndcToPlanePoint(x: number, y: number) {
      raycaster.setFromCamera({ x, y } as any, camera);
      const out = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, out);
      return out;
    }

    // --- translate --------------------------------------------------------------------------
    const boxMat = () => new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.6 });
    const boxT = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), boxMat());
    scene.add(boxT);
    editor.select(boxT);
    const beforeT = snap();
    const pS = ndcToPlanePoint(0, 0);
    const pE = ndcToPlanePoint(0.3, 0);
    const expectedDX = pE.x - pS.x;
    gizmo.simulateDrag("X", "translate", { x: 0, y: 0 }, { x: 0.3, y: 0 });
    const afterT = snap();
    const translateDeltaOk = Math.abs(boxT.position.x - expectedDX) <= 1e-3;
    const translateOtherAxesStill = Math.abs(boxT.position.y) <= 1e-3 && Math.abs(boxT.position.z) <= 1e-3;
    const translateMoved = diffMoved(beforeT, afterT);

    // --- rotate -------------------------------------------------------------------------------
    const boxR = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), boxMat());
    scene.add(boxR);
    editor.select(boxR);
    const beforeR = snap();
    const rS = ndcToPlanePoint(0.3, 0);
    const rE = ndcToPlanePoint(0.3, 0.3);
    const offset = new THREE.Vector3().subVectors(rE, rS);
    const eye = new THREE.Vector3(0, 0, 1); // camera->object direction for this fixture
    const tempVec = new THREE.Vector3(1, 0, 0).cross(eye).normalize(); // TransformControls' per-axis tangent
    const distanceToCamera = boxR.position.distanceTo(camera.position);
    const ROTATION_SPEED = 20 / distanceToCamera;
    const expectedAngle = offset.dot(tempVec) * ROTATION_SPEED;
    gizmo.simulateDrag("X", "rotate", { x: 0.3, y: 0 }, { x: 0.3, y: 0.3 });
    const afterR = snap();
    const rotateDeltaOk = Math.abs(boxR.rotation.x - expectedAngle) <= 1e-3;
    const rotateOtherAxesStill = Math.abs(boxR.rotation.y) <= 1e-3 && Math.abs(boxR.rotation.z) <= 1e-3;
    const rotateMoved = diffMoved(beforeR, afterR);

    // --- scale --------------------------------------------------------------------------------
    const boxS = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), boxMat());
    scene.add(boxS);
    editor.select(boxS);
    const beforeS = snap();
    const sS = ndcToPlanePoint(0.3, 0);
    const sE = ndcToPlanePoint(0.6, 0);
    const expectedScaleX = 1 * (sE.x / sS.x);
    gizmo.simulateDrag("X", "scale", { x: 0.3, y: 0 }, { x: 0.6, y: 0 });
    const afterS = snap();
    const scaleDeltaOk = Math.abs(boxS.scale.x - expectedScaleX) <= 1e-3;
    const scaleOtherAxesStill = Math.abs(boxS.scale.y - 1) <= 1e-3 && Math.abs(boxS.scale.z - 1) <= 1e-3;
    const scaleMoved = diffMoved(beforeS, afterS);

    return {
      translateDeltaOk,
      translateOtherAxesStill,
      translateMoved,
      rotateDeltaOk,
      rotateOtherAxesStill,
      rotateMoved,
      scaleDeltaOk,
      scaleOtherAxesStill,
      scaleMoved,
      actualPosX: boxT.position.x,
      expectedDX,
      actualRotX: boxR.rotation.x,
      expectedAngle,
      actualScaleX: boxS.scale.x,
      expectedScaleX,
    };
  });

  console.log(
    `MEASURED gizmo-translate: pos.x=${result.actualPosX} expected=${result.expectedDX} moved=${result.translateMoved.toFixed(2)}%`,
  );
  console.log(
    `MEASURED gizmo-rotate: rot.x=${result.actualRotX} expected=${result.expectedAngle} moved=${result.rotateMoved.toFixed(2)}%`,
  );
  console.log(
    `MEASURED gizmo-scale: scale.x=${result.actualScaleX} expected=${result.expectedScaleX} moved=${result.scaleMoved.toFixed(2)}%`,
  );
  expect(result.translateDeltaOk).toBe(true);
  expect(result.translateOtherAxesStill).toBe(true);
  expect(result.translateMoved).toBeGreaterThanOrEqual(0.5);
  expect(result.rotateDeltaOk).toBe(true);
  expect(result.rotateOtherAxesStill).toBe(true);
  expect(result.rotateMoved).toBeGreaterThanOrEqual(0.5);
  expect(result.scaleDeltaOk).toBe(true);
  expect(result.scaleOtherAxesStill).toBe(true);
  expect(result.scaleMoved).toBeGreaterThanOrEqual(0.5);
});

// ===========================================================================================
// Target 4 — add light / camera / primitive: object count +1; changed() for lights/non-zero
// primitives; camera-add checked by count only.
// ===========================================================================================
test("4. add: light/camera/primitive each +1 object count; light+primitive pass changed()", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const THREE_MODULE_PATH = "/node_modules/three/build/three.module.js";
    const THREE = (await import(THREE_MODULE_PATH)) as unknown as ThreeNS;
    const { attachEditor } = await import("/src/editor/index.ts");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(256, 256, true);
    const studio = { scene, camera, renderer, controls: { enabled: true }, setRenderHook(_f: any) {} };
    const editor = attachEditor(studio as any) as any;

    function snap(): Uint8ClampedArray {
      renderer.render(scene, camera);
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const ctx = off.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      return ctx.getImageData(0, 0, off.width, off.height).data;
    }
    function diffMoved(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
      const n = a.length / 4;
      let moved = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        let pmax = 0;
        for (let c = 0; c < 3; c++) pmax = Math.max(pmax, Math.abs(a[o + c] - b[o + c]));
        if (pmax > 2) moved++;
      }
      return (moved / n) * 100;
    }
    function countByPredicate(pred: (o: any) => boolean): number {
      let n = 0;
      scene.traverse((o: any) => {
        if (pred(o)) n++;
      });
      return n;
    }

    // A lit-but-dim receiving surface so a newly added light actually changes rendered pixels
    // (an empty scene renders black with or without a light in it, which would make the
    // "light passes changed()" check vacuous regardless of whether adding a light works).
    const receiver = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 }),
    );
    receiver.position.set(0, 0, -1);
    scene.add(receiver);
    scene.add(new THREE.AmbientLight(0xffffff, 0.05));

    // --- light ---
    const beforeLightCount = countByPredicate((o) => o.isLight);
    const beforeLightSnap = snap();
    editor.ops.add({ kind: "light-point", at: [0, 0, 1] });
    const afterLightCount = countByPredicate((o) => o.isLight);
    const afterLightSnap = snap();
    const lightCountDelta = afterLightCount - beforeLightCount;
    const lightMoved = diffMoved(beforeLightSnap, afterLightSnap);

    // --- primitive (non-zero-size box, lit by the light just added) ---
    const beforeMeshCount = countByPredicate((o) => o.isMesh);
    const beforePrimSnap = snap();
    editor.ops.add({ kind: "primitive-box", at: [0, 0, 0] });
    const afterMeshCount = countByPredicate((o) => o.isMesh);
    const afterPrimSnap = snap();
    const meshCountDelta = afterMeshCount - beforeMeshCount;
    const primMoved = diffMoved(beforePrimSnap, afterPrimSnap);

    // --- camera (count-only, per SCOPE.md target 4) ---
    const beforeCamCount = countByPredicate((o) => o.isCamera);
    editor.ops.add({ kind: "camera", at: [3, 3, 3] });
    const afterCamCount = countByPredicate((o) => o.isCamera);
    const camCountDelta = afterCamCount - beforeCamCount;

    return { lightCountDelta, lightMoved, meshCountDelta, primMoved, camCountDelta };
  });

  console.log(
    `MEASURED add: lightDelta=${result.lightCountDelta} lightMoved=${result.lightMoved.toFixed(2)}% meshDelta=${result.meshCountDelta} primMoved=${result.primMoved.toFixed(2)}% camDelta=${result.camCountDelta}`,
  );
  expect(result.lightCountDelta).toBe(1);
  expect(result.lightMoved).toBeGreaterThanOrEqual(0.5);
  expect(result.meshCountDelta).toBe(1);
  expect(result.primMoved).toBeGreaterThanOrEqual(0.5);
  expect(result.camCountDelta).toBe(1);
});

// ===========================================================================================
// Target 5 — PBR material panel: roughness/metalness/color drag -> changed(); reset -> same().
// ===========================================================================================
test("5. material: roughness drag passes changed(); reset-to-original passes same()", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const THREE_MODULE_PATH = "/node_modules/three/build/three.module.js";
    const THREE = (await import(THREE_MODULE_PATH)) as unknown as ThreeNS;
    const { attachEditor } = await import("/src/editor/index.ts");

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 2));
    const dl = new THREE.DirectionalLight(0xffffff, 3);
    dl.position.set(2, 3, 4);
    scene.add(dl);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 4);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(256, 256, true);
    const studio = { scene, camera, renderer, controls: { enabled: true }, setRenderHook(_f: any) {} };
    const editor = attachEditor(studio as any) as any;

    function snap(): Uint8ClampedArray {
      renderer.render(scene, camera);
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const ctx = off.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      return ctx.getImageData(0, 0, off.width, off.height).data;
    }
    function diff(a: Uint8ClampedArray, b: Uint8ClampedArray) {
      const n = a.length / 4;
      let moved = 0;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        let pmax = 0;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(a[o + c] - b[o + c]);
          sum += d;
          pmax = Math.max(pmax, d);
        }
        if (pmax > 2) moved++;
      }
      return { mean: sum / (n * 3), moved: (moved / n) * 100 };
    }

    const box = editor.ops.add({ kind: "primitive-box", at: [0, 0, 0] }) as any;
    const orig = box.material.userData.__orig;
    const preEditSnap = snap();

    editor.ops.setMaterial(box, { roughness: 0.1, metalness: 1.0, color: 0x3366ff });
    const editedSnap = snap();
    const editDiff = diff(preEditSnap, editedSnap);

    editor.ops.setMaterial(box, {
      roughness: orig.roughness,
      metalness: orig.metalness,
      color: orig.color,
      emissive: orig.emissive,
      emissiveIntensity: orig.emissiveIntensity,
    });
    const resetSnap = snap();
    const resetDiff = diff(preEditSnap, resetSnap);

    return { editMoved: editDiff.moved, resetMean: resetDiff.mean };
  });

  console.log(`MEASURED material: editMoved=${result.editMoved.toFixed(2)}% resetMean=${result.resetMean.toFixed(3)}`);
  expect(result.editMoved).toBeGreaterThanOrEqual(0.5);
  expect(result.resetMean).toBeLessThanOrEqual(0.6);
});

// ===========================================================================================
// Target 6 — mirror modifier: exactly 2x triangle count; mirrored bbox negated on the mirror
// axis within 1e-4.
// ===========================================================================================
test("6. mirror: triangle count exactly 2x; mirrored bbox negated within 1e-4", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const THREE_MODULE_PATH = "/node_modules/three/build/three.module.js";
    const THREE = (await import(THREE_MODULE_PATH)) as unknown as ThreeNS;
    const { attachEditor } = await import("/src/editor/index.ts");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 8);
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
    renderer.setSize(128, 128, true);
    const studio = { scene, camera, renderer, controls: { enabled: true }, setRenderHook(_f: any) {} };
    const editor = attachEditor(studio as any) as any;

    const box = editor.ops.add({ kind: "primitive-box", at: [2, 0.5, 0] }) as any; // off-axis, on purpose
    const triBefore = editor.__test.triangleCount();

    editor.ops.setMirror(box, "x", true);
    const triAfter = editor.__test.triangleCount();

    const sourceBox = new THREE.Box3().setFromObject(box);
    const clones = editor.__test.getClones(box);
    const mirrorClone = clones.mirror;
    const mirrorBox = new THREE.Box3().setFromObject(mirrorClone);

    const negatedMinOk = Math.abs(mirrorBox.min.x - -sourceBox.max.x) <= 1e-4;
    const negatedMaxOk = Math.abs(mirrorBox.max.x - -sourceBox.min.x) <= 1e-4;
    const yUnchanged = Math.abs(mirrorBox.min.y - sourceBox.min.y) <= 1e-4 && Math.abs(mirrorBox.max.y - sourceBox.max.y) <= 1e-4;

    // undo should drop back to the pre-mirror triangle count exactly (undo/redo integration).
    editor.undo();
    const triAfterUndo = editor.__test.triangleCount();

    return { triBefore, triAfter, triAfterUndo, negatedMinOk, negatedMaxOk, yUnchanged };
  });

  console.log(
    `MEASURED mirror: triBefore=${result.triBefore} triAfter=${result.triAfter} (x${result.triAfter / result.triBefore}) triAfterUndo=${result.triAfterUndo} negatedMin=${result.negatedMinOk} negatedMax=${result.negatedMaxOk}`,
  );
  expect(result.triAfter).toBe(result.triBefore * 2);
  expect(result.negatedMinOk).toBe(true);
  expect(result.negatedMaxOk).toBe(true);
  expect(result.yUnchanged).toBe(true);
  expect(result.triAfterUndo).toBe(result.triBefore);
});

// ===========================================================================================
// Target 7 — array modifier: count = total visible instances INCLUDING the source
// (reviews/codex_review_S2.md:15); changed() between count=1 and count=5.
// ===========================================================================================
test("7. array: count = N total visible instances incl. source; changed() between count 1 and 5", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const THREE_MODULE_PATH = "/node_modules/three/build/three.module.js";
    const THREE = (await import(THREE_MODULE_PATH)) as unknown as ThreeNS;
    const { attachEditor } = await import("/src/editor/index.ts");

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 2));
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
    renderer.setSize(256, 256, true);
    const studio = { scene, camera, renderer, controls: { enabled: true }, setRenderHook(_f: any) {} };
    const editor = attachEditor(studio as any) as any;

    function snap(): Uint8ClampedArray {
      renderer.render(scene, camera);
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const ctx = off.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      return ctx.getImageData(0, 0, off.width, off.height).data;
    }
    function diffMoved(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
      const n = a.length / 4;
      let moved = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        let pmax = 0;
        for (let c = 0; c < 3; c++) pmax = Math.max(pmax, Math.abs(a[o + c] - b[o + c]));
        if (pmax > 2) moved++;
      }
      return (moved / n) * 100;
    }
    function countVisibleInstances(source: any): number {
      let n = 0;
      scene.traverse((o: any) => {
        if (o === source) n++;
        else if (o.userData && o.userData.__editorModifierClone && o.userData.__editorModifierClone.sourceUuid === source.uuid) n++;
      });
      return n;
    }

    const box = editor.ops.add({ kind: "primitive-box", at: [-3, 0, 0] }) as any;

    editor.ops.setArray(box, 1, [1.5, 0, 0]);
    const countAt1 = editor.__test.arrayInstanceCount(box);
    const sceneCountAt1 = countVisibleInstances(box);
    const snapAt1 = snap();

    editor.ops.setArray(box, 5, [1.5, 0, 0]);
    const countAt5 = editor.__test.arrayInstanceCount(box);
    const sceneCountAt5 = countVisibleInstances(box);
    const snapAt5 = snap();

    const moved = diffMoved(snapAt1, snapAt5);

    return { countAt1, sceneCountAt1, countAt5, sceneCountAt5, moved };
  });

  console.log(
    `MEASURED array: countAt1=${result.countAt1} sceneCountAt1=${result.sceneCountAt1} countAt5=${result.countAt5} sceneCountAt5=${result.sceneCountAt5} moved(1->5)=${result.moved.toFixed(2)}%`,
  );
  expect(result.countAt1).toBe(1);
  expect(result.sceneCountAt1).toBe(1);
  expect(result.countAt5).toBe(5);
  expect(result.sceneCountAt5).toBe(5);
  expect(result.moved).toBeGreaterThanOrEqual(0.5);
});

// ===========================================================================================
// Target 8 (review-replaced) — bloom only via UnrealBloomPass, fixed composer resolution, one
// screenshot-diff check restricted to the emissive object's screen-space bounds.
// ===========================================================================================
test("8. bloom: toggling on passes changed() restricted to the emissive object's screen bounds", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const THREE_MODULE_PATH = "/node_modules/three/build/three.module.js";
    const THREE = (await import(THREE_MODULE_PATH)) as unknown as ThreeNS;
    const { attachEditor } = await import("/src/editor/index.ts");

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    document.body.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(256, 256, true);

    let hook: ((dt: number) => void) | null = null;
    const studio = {
      scene,
      camera,
      renderer,
      controls: { enabled: true },
      setRenderHook(fn: any) {
        hook = fn;
      },
    };
    const editor = attachEditor(studio as any) as any;
    function renderFrame() {
      if (hook) hook(0);
      else renderer.render(scene, camera);
    }
    function snap(): Uint8ClampedArray {
      renderFrame();
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const ctx = off.getContext("2d")!;
      ctx.drawImage(canvas, 0, 0);
      return ctx.getImageData(0, 0, off.width, off.height).data;
    }

    // Bright emissive test primitive in frame.
    const box = editor.ops.add({ kind: "primitive-box", at: [0, 0, 0] }) as any;
    editor.ops.setMaterial(box, { color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 4 });

    // Screen-space bounds of the emissive object (project its 8 bbox corners).
    const bbox = new THREE.Box3().setFromObject(box);
    const corners = [
      [bbox.min.x, bbox.min.y, bbox.min.z], [bbox.max.x, bbox.min.y, bbox.min.z],
      [bbox.min.x, bbox.max.y, bbox.min.z], [bbox.max.x, bbox.max.y, bbox.min.z],
      [bbox.min.x, bbox.min.y, bbox.max.z], [bbox.max.x, bbox.min.y, bbox.max.z],
      [bbox.min.x, bbox.max.y, bbox.max.z], [bbox.max.x, bbox.max.y, bbox.max.z],
    ];
    let minPx = Infinity, minPy = Infinity, maxPx = -Infinity, maxPy = -Infinity;
    for (const [x, y, z] of corners) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      const px = ((v.x + 1) / 2) * canvas.width;
      const py = ((1 - v.y) / 2) * canvas.height;
      minPx = Math.min(minPx, px); maxPx = Math.max(maxPx, px);
      minPy = Math.min(minPy, py); maxPy = Math.max(maxPy, py);
    }
    // Pad slightly since bloom bleeds a few pixels past the source geometry's silhouette.
    const pad = 24;
    minPx = Math.max(0, Math.floor(minPx - pad));
    minPy = Math.max(0, Math.floor(minPy - pad));
    maxPx = Math.min(canvas.width, Math.ceil(maxPx + pad));
    maxPy = Math.min(canvas.height, Math.ceil(maxPy + pad));

    function diffMovedRegion(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
      let total = 0;
      let moved = 0;
      for (let y = minPy; y < maxPy; y++) {
        for (let x = minPx; x < maxPx; x++) {
          const o = (y * canvas.width + x) * 4;
          let pmax = 0;
          for (let c = 0; c < 3; c++) pmax = Math.max(pmax, Math.abs(a[o + c] - b[o + c]));
          total++;
          if (pmax > 2) moved++;
        }
      }
      return total > 0 ? (moved / total) * 100 : 0;
    }

    const bloomOffSnap = snap();
    editor.ops.setPostFX({ bloom: { enabled: true, strength: 2.2, radius: 0.7, threshold: 0.15 } });
    const bloomOnSnap = snap();
    const movedInBounds = diffMovedRegion(bloomOffSnap, bloomOnSnap);

    return { movedInBounds, regionW: maxPx - minPx, regionH: maxPy - minPy, bloomEnabled: editor.__test.bloomState().enabled };
  });

  console.log(
    `MEASURED bloom: movedInBounds=${result.movedInBounds.toFixed(2)}% region=${result.regionW}x${result.regionH} bloomEnabled=${result.bloomEnabled}`,
  );
  expect(result.bloomEnabled).toBe(true);
  expect(result.movedInBounds).toBeGreaterThanOrEqual(0.5);
});
