"use client";
import { useEffect, useRef, useState } from "react";
import type { MRSMap } from "@/lib/nmr/mrs-client";
import { Niivue, NVImage } from "@niivue/niivue";
import { registerScanSource, snapshotCanvas } from "@/lib/assistant/scan";
import { cloneMRSAnatomy } from "@/lib/nmr/anatomy";
import { type MRSInfo, voxelMM } from "@/lib/nmr/mrs";
export function MRSAnatomy({
  info,
  selection,
  map,
}: {
  info: MRSInfo;
  selection: number[];
  map: MRSMap | null;
}) {
  const [ready, setReady] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    nv = useRef<Niivue | null>(null),
    [error, setError] = useState(""),
    [enabled, setEnabled] = useState(false);
  useEffect(
    () =>
      registerScanSource("mrs-anatomy", {
        label: "MRS anatomical localization",
        available: () =>
          enabled &&
          ready &&
          !error &&
          !!nv.current?.volumes.length &&
          !!canvas.current?.getBoundingClientRect().width,
        capture: () => {
          if (!nv.current || error) throw new Error("Anatomy is unavailable.");
          return snapshotCanvas(
            nv.current,
            "MRS voxel or map on operator-confirmed anatomy",
          );
        },
      }),
    [enabled, error, ready],
  );
  useEffect(() => {
    if (!enabled || !canvas.current) return;
    let cancelled = false;
    const n = new Niivue({
      isNearestInterpolation: true,
      show3Dcrosshair: true,
    });
    nv.current = n;
    (async () => {
      try {
        const base = cloneMRSAnatomy();
        await n.attachToCanvas(canvas.current!);
        if (cancelled) return;
        n.addVolume(base);
        n.setSliceType(3);
        n.updateGLVolume();
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      nv.current = null;
      n.cleanup();
    };
  }, [enabled]);
  useEffect(() => {
    setReady(false);
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function overlay() {
      const n = nv.current;
      if (!n || !n.volumes.length) {
        if (!stopped && !error) timer = setTimeout(overlay, 100);
        return;
      }
      try {
        const dims = info.dims.slice(0, 3),
          voxels = new Uint8Array(dims.reduce((a, b) => a * b, 1));
        if (!map)
          voxels[
            selection[0] + dims[0] * (selection[1] + dims[1] * selection[2])
          ] = 1;
        if (map)
          map.values.forEach((value, i) => {
            if (map.valid[i])
              voxels[i + dims[0] * dims[1] * map.z] = Math.max(
                1,
                Math.round((255 * value) / Math.max(...map.values, 1e-12)),
              );
          });
        const bytes = NVImage.createNiftiArray(
          dims,
          [0, 1, 2].map((j) =>
            Math.hypot(...info.affine.slice(0, 3).map((r) => r[j])),
          ),
          info.affine.flat(),
          2,
          voxels,
        );
        const vol = await NVImage.loadFromUrl({
          buffer: bytes.buffer as ArrayBuffer,
          name: "MRS selected voxel",
          colormap: "warm",
          opacity: 0.5,
          cal_min: 0,
          cal_max: map ? 255 : 1,
        });
        if (stopped) return;
        while (n.volumes.length > 1) n.removeVolume(n.volumes.at(-1)!);
        n.addVolume(vol);
        n.scene.crosshairPos = Array.from(n.mm2frac(voxelMM(info, selection)));
        n.updateGLVolume();
        n.drawScene();
        setReady(true);
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    }
    overlay();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [enabled, info, selection, map, error]);
  return (
    <section>
      <h3>Anatomical location</h3>
      <p className="hint">
        Only link the same participant and coordinate space. No registration is
        performed. The overlay shows the encoded voxel extent, not the
        excitation profile.
      </p>
      <label>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!info.localized}
          onChange={(e) => {
            setError("");
            setEnabled(e.target.checked);
          }}
        />{" "}
        I confirm the main MRI is the matching registered anatomy
      </label>
      {!info.localized && (
        <p>No usable spatial localization in this acquisition.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {enabled && (
        <canvas
          ref={canvas}
          aria-label="MRS voxel on matching anatomy"
          style={{ width: "100%", height: 300, display: "block" }}
        />
      )}
      <p className="mono">
        RAS mm:{" "}
        {info.localized
          ? voxelMM(info, selection)
              .map((v) => v.toFixed(2))
              .join(", ")
          : "Unavailable"}
      </p>
    </section>
  );
}
