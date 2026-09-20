import assert from "node:assert/strict";
import {
  ScanViewController,
  inferViewMode,
  zoomForScale,
} from "../lib/viewer-state.ts";

const listeners = new Map<string, Function>();
Object.assign(globalThis, {
  window: { addEventListener() {}, removeEventListener() {} },
  cancelAnimationFrame() {},
  requestAnimationFrame: (f: Function) => {
    f();
    return 1;
  },
});
let width = 600,
  height = 400;
const canvas = {
  width,
  getBoundingClientRect: () => ({ width, height }),
  parentElement: { getBoundingClientRect: () => ({ width, height }) },
  addEventListener: (name: string, fn: Function) => listeners.set(name, fn),
  removeEventListener: (name: string) => listeners.delete(name),
  setPointerCapture() {},
};
const n: any = {
  canvas,
  scene: { pan2Dxyzmm: [0, 0, 0, 1], crosshairPos: [0.5, 0.5, 0.5] },
  volumes: [{ id: "image", cal_min: 0, cal_max: 100, frame4D: 0, nFrame4D: 3 }],
  screenSlices: [],
  resizeListener() {
    canvas.width = width * 2;
    this.drawScene();
  },
  drawScene() {
    this.screenSlices = [
      {
        axCorSag: 0,
        leftTopWidthHeight: [0, 0, canvas.width, height * 2],
        fovMM: [200 / this.scene.pan2Dxyzmm[3], 200],
      },
    ];
  },
  setPan2Dxyzmm(p: number[]) {
    this.scene.pan2Dxyzmm = [...p];
    this.drawScene();
  },
  setScale() {},
  setFrame4D(_: string, frame: number) {
    this.volumes[0].frame4D = frame;
  },
  updateGLVolume() {},
  setSliceType() {
    this.drawScene();
  },
};
n.resizeListener();
let last: any;
const originalResize = n.resizeListener;
const c = new ScanViewController(n, (view) => {
  last = view;
});
c.fit();
assert.equal(last.mode, "fit");
assert.equal(last.pixelsPerMM, 3);
width = 300;
n.resizeListener();
assert.equal(last.pan[3], 1);
assert.equal(last.pixelsPerMM, 1.5);
c.setZoom(2);
assert.equal(last.mode, "manual");
assert.equal(last.pixelsPerMM, 3);
width = 600;
n.resizeListener();
assert.equal(last.pan[3], 1);
assert.equal(last.mode, "manual");
assert.equal(last.pixelsPerMM, 3);
n.resizeListener();
assert.equal(last.pan[3], 1, "Repeated resize must not accumulate zoom");
width = 0;
n.resizeListener();
assert.equal(last.pixelsPerMM, 3, "Hidden views retain their last scale");
width = 400;
n.resizeListener();
assert.equal(last.pan[3], 1.5);
const handoff = {
  ...last,
  cursor: [0.2, 0.4, 0.6],
  pan: [10, 20, 30, 1.5],
  contrast: [40, 300],
  frame: 99,
};
width = 800;
n.resizeListener();
c.restore(handoff);
assert.equal(last.pixelsPerMM, 3);
assert.equal(last.pan[3], 0.75);
assert.deepEqual(last.pan.slice(0, 3), [10, 20, 30]);
assert.deepEqual(last.cursor, [0.2, 0.4, 0.6]);
assert.deepEqual(last.contrast, [40, 300]);
assert.equal(last.frame, 2);
c.fit();
n.scene.crosshairPos = [0.1, 0.2, 0.3];
c.capture();
assert.equal(last.mode, "fit", "Cursor changes do not disable Fit");
n.scene.pan2Dxyzmm = [1, 0, 0, 1];
c.capture();
assert.equal(last.mode, "manual", "Pointer panning disables Fit");
assert.equal(inferViewMode({ pan: [0, 0, 0, 1] }), "fit");
assert.equal(inferViewMode({ pan: [0, 0, 0, 2] }), "manual");
assert.equal(zoomForScale(2, 0, 3), 2);
c.dispose();
assert.equal(n.resizeListener, originalResize);
assert.equal(listeners.size, 0);
console.log(
  "PASS: shared viewer fit/manual resizing, physical scale handoff, hidden views, frame bounds, old state and event cleanup.",
);
