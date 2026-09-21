"use client";
import { registerMRSAnatomy } from "@/lib/nmr/anatomy";
import { registerScanSource, snapshotCanvas } from "@/lib/assistant/scan";
import { registerAssistantViewer } from "@/lib/assistant/viewer";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain,
  Maximize2,
  Minimize2,
  Layers,
  SlidersHorizontal,
  Crosshair,
  RotateCcw,
  Download,
  Grid2X2,
  Box,
  BookOpen,
  Plus,
  Eye,
  EyeOff,
  X,
  Ruler,
  Hand,
  Contrast,
  Pencil,
  Undo2,
  Eraser,
  Play,
  Pause,
  Save,
  FolderOpen,
  ScanLine,
  ChevronUp,
  ChevronDown,
  Triangle,
  FileDown,
} from "lucide-react";
import type {
  Niivue,
  NVImage,
  CompletedMeasurement,
  CompletedAngle,
} from "@niivue/niivue";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScanViewController, type ViewMode } from "@/lib/viewer-state";
import type { RepositoryFile } from "@/lib/repositories";
import { CollectionLibrary } from "./collection-library";
import { ScanAnnotations } from "./scan-annotations";
import { annotationSource } from "@/lib/annotations";
import { StudyComparison } from "./study-comparison";
import {
  COLLECTION_STORAGE_KEY,
  readSavedCollection,
  parseCollectionSession,
  paneViewKey,
  type PaneView,
} from "@/lib/collection-session";
import { CaseNotes } from "./case-documentation";
import type {
  StudyCollection,
  Study,
  CaseDocumentation,
} from "@/lib/study-collection";
import { RepositoryBrowser } from "./repositories";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { loadDicomConverter } from "@/lib/dicom";
import { Range, Choice, downloadBlob } from "./controls";

type Layer = {
  id: string;
  name: string;
  opacity: number;
  colormap: string;
  min: number;
  max: number;
  dims: number[];
  spacing: number[];
  frames: number;
  frame: number;
};
const MODES = [
  ["3", "Multiplanar + 3D"],
  ["0", "Axial"],
  ["1", "Coronal"],
  ["2", "Sagittal"],
  ["4", "3D volume"],
] as [string, string][];
const TOOLS = [
  { id: "crosshair", label: "Locate", Icon: Crosshair, key: "C" },
  { id: "windowing", label: "Window / level", Icon: Contrast, key: "W" },
  { id: "pan", label: "Pan", Icon: Hand, key: "P" },
  { id: "measurement", label: "Distance", Icon: Ruler, key: "D" },
  { id: "angle", label: "Angle", Icon: Triangle, key: "A" },
  { id: "draw", label: "Draw label", Icon: Pencil, key: "B" },
  { id: "erase", label: "Erase label", Icon: Eraser, key: "E" },
];
export default function MRIWorkspace({
  panel,
  onClosePanel,
  active,
  importTick,
}: {
  panel: string;
  onClosePanel: () => void;
  active: boolean;
  importTick: number;
}) {
  const [assistantRecord, setAssistantRecord] = useState<
    { provider: string; id: string } | undefined
  >();
  const [collection, setCollection] = useState<StudyCollection | null>(null);
  const [comparing, setComparing] = useState(false);
  const comparingRef = useRef(comparing);
  comparingRef.current = comparing;
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [collectionRevision, setCollectionRevision] = useState(0);
  const controller = useRef<ScanViewController | null>(null);
  const mainScan = useRef<{
    collectionId: string;
    study: Study;
    source: RepositoryFile;
  } | null>(null);
  const [caseContext, setCaseContext] = useState<{
    study: Study;
    source: RepositoryFile;
  } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("fit");
  function rememberMainView(view: PaneView) {
    setZoom(view.pan[3]);
    setViewMode(view.mode || "fit");
    const context = mainScan.current;
    if (!context || comparingRef.current) return;
    try {
      const saved = readSavedCollection();
      if (!saved || saved.collection.id !== context.collectionId) return;
      saved.view.panes = {
        ...saved.view.panes,
        [paneViewKey(context.study.id, context.source.name)]: view,
      };
      localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      /* Explicit collection export remains available if storage is full. */
    }
  }

  const collectionInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      const saved = readSavedCollection();
      if (saved) {
        setCollection(saved.collection);
        setDocumentation(saved.collection.documentation);
      }
    } catch {
      toast.error(
        "Saved collection could not be restored. You can open an exported collection file.",
      );
    }
  }, []);
  const [documentation, setDocumentation] = useState<CaseDocumentation | null>(
    null,
  );
  const [notesOpen, setNotesOpen] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    nv = useRef<Niivue | null>(null),
    files = useRef<HTMLInputElement>(null),
    folder = useRef<HTMLInputElement>(null),
    session = useRef<HTMLInputElement>(null),
    busyRef = useRef(false),
    prevImport = useRef(importTick);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState("Loading open brain reference…"),
    [error, setError] = useState(""),
    [layers, setLayers] = useState<Layer[]>([]),
    [selected, setSelected] = useState(""),
    [sample, setSample] = useState(true),
    [showImport, setShowImport] = useState(false),
    [tool, setTool] = useState("crosshair"),
    [layout, setLayout] = useState("3"),
    [cross, setCross] = useState(true),
    [radiological, setRadiological] = useState(false),
    [ruler, setRuler] = useState(true),
    [zoom, setZoom] = useState(1),
    [gamma, setGamma] = useState(1),
    [expanded, setExpanded] = useState(false),
    [nearest, setNearest] = useState(true),
    [clip, setClip] = useState(2),
    [pos, setPos] = useState<number[]>([0.5, 0.5, 0.5]),
    [mm, setMM] = useState<number[]>([0, 0, 0]),
    [measurements, setMeasurements] = useState<
      (CompletedMeasurement | CompletedAngle)[]
    >([]),
    [playing, setPlaying] = useState(false),
    [fps, setFps] = useState(8),
    [pen, setPen] = useState("1"),
    [drawOpacity, setDrawOpacity] = useState(0.6),
    [lesson, setLesson] = useState(true);
  const sync = useCallback(() => {
    const n = nv.current;
    if (!n) return;
    if (n.volumes.length) {
      setPos(Array.from(n.scene.crosshairPos));
      setMM(Array.from(n.frac2mm(n.scene.crosshairPos)).slice(0, 3));
    }
    setLayers(
      n.volumes.map((v) => ({
        id: v.id,
        name: v.name || "Volume",
        opacity: v.opacity,
        colormap: v.colormap,
        min: v.cal_min ?? 0,
        max: v.cal_max ?? 1,
        dims: Array.from(v.hdr?.dims?.slice(1, 4) || []),
        spacing: Array.from(v.hdr?.pixDims?.slice(1, 4) || []),
        frames: v.nFrame4D || 1,
        frame: v.frame4D || 0,
      })),
    );
    setSelected((s) =>
      n.volumes.some((v) => v.id === s) ? s : n.volumes[0]?.id || "",
    );
  }, []);
  const selectedLayer = layers.find((v) => v.id === selected),
    base = layers[0];
  const run = useCallback(
    async (message: string, action: () => Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(message);
      setError("");
      try {
        await action();
        sync();
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg);
        setError(msg);
        return false;
      } finally {
        busyRef.current = false;
        setBusy("");
      }
    },
    [sync],
  );
  useEffect(() => {
    let cancelled = false;
    let instance: Niivue | undefined;
    async function start() {
      try {
        const { Niivue } = await import("@niivue/niivue");
        if (cancelled || !canvas.current) return;
        instance = new Niivue({
          isNearestInterpolation: true,
          backColor: [0.03, 0.045, 0.06, 1],
          crosshairColor: [1, 0.85, 0.05, 1],
          show3Dcrosshair: true,
          gradientAmount: 0.6,
          crosshairWidth: 0.5,
          crosshairWidthUnit: "percent",
          isColorbar: false,
          isRuler: true,
          fontMinPx: 13,
          fontSizeScaling: 0.4,
          multiplanarShowRender: 1,
          multiplanarLayout: 0,
          dragAndDropEnabled: false,
          maxDrawUndoBitmaps: 8,
          isRadiologicalConvention: false,
        });
        // NiiVue renders occluded cursor segments at 15% opacity. Keep the
        // depth cue, but make the cursor readable through a full-head volume.
        const drawCrosshairs = instance.drawCrosshairs3D.bind(instance);
        instance.drawCrosshairs3D = (
          ...args: Parameters<Niivue["drawCrosshairs3D"]>
        ) => {
          if (args[0] === false) args[1] = 0.55;
          drawCrosshairs(...args);
        };
        await instance.attachToCanvas(canvas.current);
        if (cancelled) {
          instance.cleanup();
          return;
        }
        mainScan.current = null;
        setCaseContext(null);
        nv.current = instance;
        controller.current = new ScanViewController(instance, rememberMainView);
        instance.onLocationChange = (location) => {
          const l = location as { frac: number[]; mm: number[] };
          if (l.frac) setPos(Array.from(l.frac).slice(0, 3));
          if (l.mm) setMM(Array.from(l.mm).slice(0, 3));
        };
        instance.onIntensityChange = () => sync();
        instance.onMeasurementCompleted = (m) =>
          setMeasurements((s) => [...s, m]);
        instance.onAngleCompleted = (m) => setMeasurements((s) => [...s, m]);
        instance.onImageLoaded = () => sync();
        await instance.loadVolumes([
          { url: "/data/mni-t1.nii.gz", name: "MNI152_T1.nii.gz" },
        ]);
        if (cancelled) return;
        await instance.setVolumeRenderIllumination(0.6);
        controller.current?.fit();
        setReady(true);
        sync();
        setBusy("");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setBusy("");
        }
      }
    }
    start();
    return () => {
      cancelled = true;
      controller.current?.dispose();
      controller.current = null;
      instance?.cleanup();
      nv.current = null;
    };
  }, [sync]);
  useEffect(() => {
    if (!active) {
      setPlaying(false);
      return;
    }
    const frame = requestAnimationFrame(() => {
      nv.current?.resizeListener();
      nv.current?.drawScene();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, ready, panel, expanded]);
  useEffect(() => {
    if (importTick !== prevImport.current) {
      prevImport.current = importTick;
      if (active && importTick) setShowImport(true);
    }
  }, [importTick, active]);
  useEffect(() => {
    if (!nv.current || !ready) return;
    const n = nv.current;
    const drawing = tool === "draw" || tool === "erase";
    const mapping: { [key: string]: number } = {
      crosshair: 8,
      windowing: 9,
      pan: 3,
      measurement: 2,
      angle: 7,
    };
    const mode = mapping[tool] ?? 8;
    n.setDrawingEnabled(drawing);
    if (drawing) n.setPenValue(tool === "erase" ? 0 : Number(pen));
    n.setMouseEventConfig({
      leftButton: { primary: mode, withShift: 3, withCtrl: 2 },
      rightButton: 9,
      centerButton: 3,
    });
    n.setTouchEventConfig({ singleTouch: mode, doubleTouch: 3 });
  }, [tool, pen, ready]);
  useEffect(() => {
    if (!playing || !active) return;
    const t = setInterval(() => {
      const n = nv.current;
      if (!n?.volumes.length) return;
      const v = n.volumes.find((v) => v.id === selected) || n.volumes[0];
      if ((v.nFrame4D || 1) > 1) {
        n.setFrame4D(v.id, (v.frame4D + 1) % (v.nFrame4D || 1));
        sync();
      } else {
        const axis = layout === "2" ? 0 : layout === "1" ? 1 : 2;
        const dims = n.volumes[0].dimsRAS;
        const step = 1 / Math.max(1, (dims?.[axis + 1] || 100) - 1);
        const p = Array.from(n.scene.crosshairPos);
        p[axis] = p[axis] + step > 1 ? 0 : p[axis] + step;
        n.scene.crosshairPos = p as [number, number, number];
        n.drawScene();
        setPos(p);
        setMM(Array.from(n.frac2mm(n.scene.crosshairPos)).slice(0, 3));
      }
    }, 1000 / fps);
    return () => clearInterval(t);
  }, [playing, active, fps, selected, layout, sync]);
  function move(axis: number, value: number) {
    const n = nv.current;
    if (!n) return;
    const p = Array.from(n.scene.crosshairPos);
    p[axis] = Math.max(0, Math.min(1, value));
    n.scene.crosshairPos = p as [number, number, number];
    n.drawScene();
    setPos(p);
    const m = n.frac2mm(p);
    setMM(Array.from(m).slice(0, 3));
  }
  useEffect(() => registerMRSAnatomy(() => busy ? undefined : nv.current?.volumes[0]), [busy]);
  useEffect(
    () =>
      registerAssistantViewer({
        openRecord: (provider, id) => {
          setAssistantRecord({ provider, id });
          setShowImport(true);
        },
        context: () => ({
          view: comparing
            ? "comparison (actions target main viewer only)"
            : "main",
          layout,
          sampling: nearest ? "native" : "smooth",
          layers: layers.map(({ name, dims, spacing, frames }) => ({
            name,
            dims,
            spacing,
            frames,
          })),
          documentation: documentation
            ? {
                title: documentation.title,
                source: documentation.source,
                license: documentation.license,
                sections: documentation.sections
                  .map((s) => ({ title: s.title, text: s.text.slice(0, 2000) }))
                  .slice(0, 4),
              }
            : null,
        }),
        apply: (action) => {
          if (busy || !nv.current)
            throw new Error("Wait for the MRI viewer to finish loading.");
          if (action.kind === "open_import") {
            setShowImport(true);
            return () => setShowImport(false);
          }
          if (action.kind === "case_notes") {
            if (!documentation) throw new Error("No case notes are loaded.");
            setNotesOpen(true);
            return () => setNotesOpen(false);
          }
          if (comparing)
            throw new Error(
              "Return to the main viewer before applying this display change.",
            );
          const n = nv.current;
          if (action.kind === "layout") {
            const value = String(
              { axial: 0, coronal: 1, sagittal: 2, multiplanar: 3, volume: 4 }[
                action.plane
              ],
            );
            setLayout(value);
            controller.current?.setLayout(Number(value));
            return () => {
              setLayout(layout);
              controller.current?.setLayout(Number(layout));
            };
          }
          if (action.kind === "sampling") {
            setNearest(action.mode === "native");
            n.setInterpolation(action.mode === "native");
            return () => {
              setNearest(nearest);
              n.setInterpolation(nearest);
            };
          }
          if (action.kind === "fit") {
            const before = controller.current?.capture(false);
            const volume = n.volumes[0];
            controller.current?.fit();
            return () => {
              if (nv.current !== n || n.volumes[0] !== volume)
                throw new Error(
                  "The scan changed; this undo no longer applies.",
                );
              if (before) controller.current?.restore(before);
            };
          }
          throw new Error("Unsupported viewer action.");
        },
      }),
    [layout, nearest, layers, documentation, comparing, busy],
  );
  useEffect(
    () =>
      registerScanSource("main", {
        label: "Main MRI view",
        available: () =>
          active &&
          !comparing &&
          !busy &&
          !!nv.current?.volumes.length &&
          !!canvas.current?.getBoundingClientRect().width,
        capture: () => snapshotCanvas(nv.current!, "Main MRI view"),
      }),
    [active, comparing, busy],
  );
  function reset() {
    const n = nv.current;
    if (!n) return;
    n.scene.crosshairPos = [0.5, 0.5, 0.5];
    controller.current?.fit();
    n.setScale(1);
    n.setGamma(1);
    n.setClipPlane([2, 0, 0]);
    n.setRenderAzimuthElevation(110, 15);
    setPos([0.5, 0.5, 0.5]);
    setMM(Array.from(n.frac2mm(n.scene.crosshairPos)).slice(0, 3));
    setZoom(1);
    setGamma(1);
    setClip(2);
    setPlaying(false);
    n.drawScene();
  }
  function restoreImages() {
    const n = nv.current;
    if (!n?.volumes.length) return;
    reset();
    // Recover display settings without replacing scans, labels or measurements.
    const baseVolume = n.volumes[0];
    n.setOpacity(0, 1);
    baseVolume.cal_min = baseVolume.robust_min;
    baseVolume.cal_max = baseVolume.robust_max;
    n.opts.crosshairColor = [1, 0.85, 0.05, 1];
    n.opts.crosshairWidthUnit = "percent";
    n.opts.show3Dcrosshair = true;
    n.setCrosshairWidth(0.5);
    setCross(true);
    setLayout("3");
    n.setSliceType(3);
    setTool("crosshair");
    n.updateGLVolume();
    n.resizeListener();
    sync();
    toast.success(
      "Images restored: centered view, visible base layer and automatic contrast.",
    );
  }
  useEffect(() => {
    if (!active || comparing) return;
    function key(e: KeyboardEvent) {
      if (controller.current?.interacting) return;
      if (
        (e.target as HTMLElement)?.closest(
          "input,textarea,[role=dialog],[role=combobox]",
        ) ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const found = TOOLS.find(
        (t) => t.key.toLowerCase() === e.key.toLowerCase(),
      );
      if (found) setTool(found.id);
      if (e.key === "Escape") {
        setTool("crosshair");
        setExpanded(false);
      }
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (e.key === "r") reset();
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const n = nv.current;
        if (n) {
          const axis = layout === "2" ? 0 : layout === "1" ? 1 : 2;
          move(
            axis,
            n.scene.crosshairPos[axis] +
              (e.key === "ArrowUp" ? 1 : -1) /
                Math.max(1, (n.volumes[0]?.dimsRAS?.[axis + 1] || 100) - 1),
          );
        }
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active, layout, comparing]);
  function setLayer(id: string, changes: Partial<Layer>) {
    const n = nv.current;
    if (!n) return;
    const v = n.volumes.find((v) => v.id === id);
    if (!v) return;
    if (changes.opacity !== undefined)
      n.setOpacity(n.volumes.indexOf(v), changes.opacity);
    if (changes.colormap !== undefined) n.setColormap(id, changes.colormap);
    if (changes.min !== undefined) v.cal_min = changes.min;
    if (changes.max !== undefined) v.cal_max = changes.max;
    n.updateGLVolume();
    sync();
  }
  function addSample(kind: string) {
    run("Loading aligned reference layer…", async () => {
      const n = nv.current;
      if (!n) return;
      const { NVImage } = await import("@niivue/niivue");
      const name = `MNI152_${kind.toUpperCase()}.nii.gz`;
      if (n.volumes.some((v) => v.name === name)) {
        toast.info("This reference layer is already loaded.");
        return;
      }
      const v = await NVImage.loadFromUrl({
        url: `/data/mni-${kind}.nii.gz`,
        name,
        colormap: kind === "gm" ? "warm" : "gray",
        opacity: kind === "gm" ? 0.45 : 0.5,
      });
      n.addVolume(v);
      setSelected(v.id);
    });
  }
  async function importFiles(list: File[], replaceStudy = false) {
    if (!list.length) return;
    setShowImport(false);
    setPlaying(false);
    return await run("Reading scan data locally…", async () => {
      const n = nv.current;
      if (!n) return;
      if (list.reduce((s, f) => s + f.size, 0) > 512 * 1024 * 1024)
        throw new Error(
          "Please import less than 512 MB at a time. Large studies can exceed browser memory.",
        );
      const { NVImage } = await import("@niivue/niivue");
      const volumeFiles = list.filter((f) =>
        /\.(nii(\.gz)?|nrrd|mgh|mgz)$/i.test(f.name),
      );
      const dicoms = list.filter(
        (f) =>
          !volumeFiles.includes(f) &&
          !/^\.|\.(json|txt|xml|jpg|png|pdf)$/i.test(f.name),
      );
      let parsed: NVImage[] = [];
      for (const f of volumeFiles)
        parsed.push(await NVImage.loadFromFile({ file: f }));
      if (dicoms.length) {
        setBusy(`Converting ${dicoms.length} DICOM files locally…`);
        const Dcm2niix = await loadDicomConverter();
        const converter = new Dcm2niix();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            (async () => {
              await converter.init();
              return await converter.input(dicoms).run();
            })(),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(
                () =>
                  reject(
                    new Error(
                      "DICOM conversion timed out. Try a smaller series or convert to NIfTI.",
                    ),
                  ),
                120000,
              );
            }),
          ]);
          for (const f of result as File[]) {
            if (/\.nii(\.gz)?$/i.test(f.name))
              parsed.push(await NVImage.loadFromFile({ file: f }));
          }
        } finally {
          clearTimeout(timeout);
          converter.worker?.terminate();
        }
      }
      if (!parsed.length)
        throw new Error(
          "No supported volumes found. Select NIfTI, NRRD, or a complete DICOM series.",
        );
      mainScan.current = null;
      setCaseContext(null);
      if (sample || replaceStudy) {
        const drawingCallback = n.onDrawingChanged;
        n.onDrawingChanged = () => {};
        n.closeDrawing();
        n.onDrawingChanged = drawingCallback;
        n.clearAllMeasurements();
        setMeasurements([]);
        for (const v of [...n.volumes]) n.removeVolume(v);
        setSample(false);
      }
      for (const v of parsed) {
        if (n.volumes.length) v.opacity = 0.5;
        n.addVolume(v);
      }
      setSelected(parsed[0].id);
      toast.success(
        `${parsed.length} volume${parsed.length > 1 ? "s" : ""} imported`,
      );
      reset();
    });
  }
  async function restore(f: File) {
    await run("Restoring MRI session…", async () => {
      const n = nv.current;
      if (!n) return;
      if (f.size > 512 * 1024 * 1024)
        throw new Error("Session exceeds the 512 MB import limit.");
      const url = URL.createObjectURL(f);
      try {
        mainScan.current = null;
        setCaseContext(null);
        await n.loadDocumentFromUrl(url);
        setSample(false);
        setMeasurements([
          ...(n.document.completedMeasurements || []),
          ...(n.document.completedAngles || []),
        ]);
        setLayout(String(n.opts.sliceType));
        setCross(n.opts.crosshairWidth > 0);
        setNearest(n.opts.isNearestInterpolation);
        n.setHighResolutionCapable(0);
        setRadiological(n.opts.isRadiologicalConvention);
        setPos(Array.from(n.scene.crosshairPos));
        controller.current?.capture();
      } finally {
        URL.revokeObjectURL(url);
      }
    });
  }
  const dims = nv.current?.volumes[0]?.dimsRAS?.slice(1, 4) ||
    base?.dims || [1, 1, 1];
  return (
    <section className="workspace" aria-label="MRI workspace">
      <CollectionLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onImport={() => collectionInput.current?.click()}
        onOpen={(saved) => {
          try {
            localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(saved));
            mainScan.current = null;
            setCollection(saved.collection);
            setDocumentation(saved.collection.documentation);
            setCollectionRevision((v) => v + 1);
            setLibraryOpen(false);
            setExpanded(false);
            setComparing(true);
            setPlaying(false);
          } catch {
            toast.error(
              "Could not open this collection: browser storage is unavailable.",
            );
          }
        }}
      />
      <input
        hidden
        ref={collectionInput}
        type="file"
        accept=".json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            if (file.size > 20 * 1024 * 1024)
              throw new Error("Collection file exceeds 20 MB.");
            const saved = parseCollectionSession(await file.text());
            localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(saved));
            mainScan.current = null;
            setCollection(saved.collection);
            setCollectionRevision((v) => v + 1);
            setLibraryOpen(false);
            setDocumentation(saved.collection.documentation);
            setExpanded(false);
            setComparing(true);
            toast.success("Collection restored");
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not restore collection",
            );
          }
        }}
      />
      {comparing && active && collection && (
        <StudyComparison
          key={`${collection.id}:${collectionRevision}`}
          onLibrary={() => setLibraryOpen(true)}
          collection={collection}
          onClose={() => setComparing(false)}
          onOpen={async (file, view, study, source) => {
            controller.current?.capture();
            const previous = mainScan.current;
            const sameScan =
              previous?.collectionId === collection.id &&
              previous.study.id === study.id &&
              previous.source.name === source.name;
            if (!sameScan) {
              const ok = await importFiles([file], true);
              if (!ok) return;
            }
            mainScan.current = { collectionId: collection.id, study, source };
            setCaseContext({ study, source });
            controller.current?.restore(view);
            sync();
            setDocumentation(collection.documentation);
            setComparing(false);
          }}
        />
      )}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent>
          <DialogTitle>Study documentation</DialogTitle>
          <DialogDescription>
            Source notes and metadata supplied with the study.
          </DialogDescription>
          <div className="dialog-body">
            {documentation && (
              <CaseNotes
                doc={documentation}
                study={caseContext?.study}
                file={caseContext?.source}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <input
        hidden
        ref={files}
        type="file"
        multiple
        onChange={(e) => {
          importFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={folder}
        type="file"
        multiple
        {...({
          webkitdirectory: "",
        } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={(e) => {
          importFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={session}
        type="file"
        accept=".nvd,.json,.gz"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) restore(f);
          e.target.value = "";
        }}
      />
      <aside
        inert={comparing}
        className={`panel left-panel ${panel === "layers" ? "mobile-open" : ""}`}
      >
        <div className="panel-head">
          <span>
            <Layers />
            Study & layers
          </span>
          <button
            className="btn icon ghost mobile-toggle close-layers"
            aria-label="Close layers"
            onClick={onClosePanel}
          >
            <X />
          </button>
          <span className="badge">
            {String(layers.length).padStart(2, "0")}
          </span>
        </div>
        <div className="panel-section">
          <button
            className="btn wide"
            onClick={() => collectionInput.current?.click()}
          >
            Import collection file
          </button>
          <button
            className="btn wide"
            onClick={() => {
              controller.current?.capture();
              setLibraryOpen(true);
            }}
          >
            Collection library
          </button>
          <p className="eyebrow">
            {sample ? "Reference study" : "Loaded study"}
          </p>
          <h2 className="study-title">
            {sample
              ? "MNI152 brain atlas"
              : base?.name.replace(/\.nii(\.gz)?$/, "") || "No study loaded"}
          </h2>
          <p className="meta">
            {sample
              ? "Anatomical reference · ICBM 2009c"
              : "Images stay on this device"}
          </p>
          <span className="badge">
            {sample ? "FREE REFERENCE DATA" : "LOCAL FILES"}
          </span>
        </div>
        <div className="panel-section">
          {collection && (
            <button
              className="btn wide"
              onClick={() => {
                controller.current?.capture();
                setPlaying(false);
                onClosePanel();
                setExpanded(false);
                setComparing(true);
              }}
            >
              Compare participants ({collection.studies.length} studies)
            </button>
          )}
          {documentation && (
            <button className="btn wide" onClick={() => setNotesOpen(true)}>
              Study documentation
            </button>
          )}
          <div className="control-label">
            <span className="eyebrow">Volume layers</span>
            <button
              className="btn small ghost"
              onClick={() => setShowImport(true)}
              aria-label="Add volume"
            >
              <Plus />
            </button>
          </div>
          {layers.map((v, i) => (
            <div
              className={`layer ${selected === v.id ? "selected" : ""}`}
              key={v.id}
            >
              <div className="layer-title">
                <button
                  className="layer-select"
                  onClick={() => setSelected(v.id)}
                  title={v.name}
                >
                  <span
                    className="color-dot"
                    style={{ background: i ? "#e3b778" : "#79dbc8" }}
                  />
                  {v.name.replace(/\.nii(\.gz)?$/, "").replaceAll("_", " ")}
                </button>
                <button
                  className="btn icon small ghost"
                  aria-label={`${v.opacity ? "Hide" : "Show"} ${v.name}`}
                  onClick={() => setLayer(v.id, { opacity: v.opacity ? 0 : 1 })}
                >
                  {v.opacity ? <Eye /> : <EyeOff />}
                </button>
              </div>
              <div className="layer-detail">
                {i === 0 ? "Base volume" : "Overlay"} · {v.dims.join(" × ")}
              </div>
              <Range
                label="Opacity"
                value={v.opacity * 100}
                onChange={(x) => setLayer(v.id, { opacity: x / 100 })}
                unit="%"
              />
              <div className="layer-actions">
                <button
                  disabled={i < 2}
                  className="btn ghost small"
                  aria-label={`Move ${v.name} up`}
                  onClick={() => {
                    nv.current?.moveVolumeDown(nv.current.volumes[i]);
                    sync();
                  }}
                >
                  <ChevronUp />
                </button>
                <button
                  disabled={i === 0 || i === layers.length - 1}
                  className="btn ghost small"
                  aria-label={`Move ${v.name} down`}
                  onClick={() => {
                    nv.current?.moveVolumeUp(nv.current.volumes[i]);
                    sync();
                  }}
                >
                  <ChevronDown />
                </button>
                <button
                  className="btn ghost small"
                  aria-label={`Remove ${v.name}`}
                  onClick={() => {
                    const n = nv.current;
                    if (n) {
                      n.removeVolumeByIndex(i);
                      if (i === 0) {
                        n.clearAllMeasurements();
                        const drawingCallback = n.onDrawingChanged;
                        n.onDrawingChanged = () => {};
                        n.closeDrawing();
                        n.onDrawingChanged = drawingCallback;
                        setMeasurements([]);
                      }
                      sync();
                    }
                  }}
                >
                  <X />
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            className="btn wide"
            disabled={!ready || !!busy}
            onClick={() => setShowImport(true)}
          >
            <Plus />
            Add scan or series
          </button>
          {sample && (
            <div className="sample-add">
              <button
                className="btn small"
                disabled={!!busy}
                onClick={() => addSample("t2")}
              >
                + T2 reference
              </button>
              <button
                className="btn small"
                disabled={!!busy}
                onClick={() => addSample("gm")}
              >
                + Gray matter
              </button>
            </div>
          )}
          <p className="hint">
            Overlays use image coordinates. Import scans already registered to
            the same anatomy.
          </p>
        </div>
        <div className="panel-section">
          <p className="eyebrow">Session</p>
          <div className="full-row">
            <button
              className="btn"
              disabled={!layers.length || !!busy}
              onClick={() =>
                run("Saving MRI session…", async () => {
                  await nv.current?.saveDocument("nmrview-session.nvd", true);
                })
              }
            >
              <Save />
              Save
            </button>
            <button
              className="btn"
              disabled={!!busy}
              onClick={() => session.current?.click()}
            >
              <FolderOpen />
              Open
            </button>
          </div>
          <p className="hint">
            Sessions include volumes, views, measurements and drawings.
          </p>
          <button
            className="btn ghost wide"
            disabled={!!busy}
            onClick={() =>
              run("Loading reference study…", async () => {
                const n = nv.current;
                if (!n) return;
                await n.loadVolumes([
                  { url: "/data/mni-t1.nii.gz", name: "MNI152_T1.nii.gz" },
                ]);
                mainScan.current = null;
                setCaseContext(null);
                const drawingCallback = n.onDrawingChanged;
                n.onDrawingChanged = () => {};
                n.closeDrawing();
                n.onDrawingChanged = drawingCallback;
                n.clearAllMeasurements();
                setMeasurements([]);
                setSample(true);
                setTool("crosshair");
                setLayout("3");
                n.setSliceType(3);
                reset();
              })
            }
          >
            <BookOpen />
            Load free reference
          </button>
        </div>
        <div className="panel-section">
          <div className="switch-row" style={{ marginTop: 0 }}>
            <span>
              <BookOpen
                size={16}
                style={{ display: "inline", marginRight: 6 }}
              />
              Learning notes
            </span>
            <Switch
              aria-label="Learning notes"
              checked={lesson}
              onCheckedChange={setLesson}
            />
          </div>
          {lesson && (
            <div className="learn-card" style={{ marginTop: 14 }}>
              <strong>
                {layout === "0"
                  ? "Axial plane"
                  : layout === "1"
                    ? "Coronal plane"
                    : layout === "2"
                      ? "Sagittal plane"
                      : layout === "4"
                        ? "Volume rendering"
                        : "One location, three planes"}
              </strong>
              <p>
                {layout === "0"
                  ? "A horizontal section separates superior and inferior anatomy."
                  : layout === "1"
                    ? "A frontal section separates anterior and posterior anatomy."
                    : layout === "2"
                      ? "A sagittal section separates left and right anatomy."
                      : layout === "4"
                        ? "Drag to rotate. The clipping control reveals internal structures."
                        : "Axial, coronal and sagittal slices intersect at the crosshair. Orientation letters are taken from the image transform."}
              </p>
            </div>
          )}
        </div>
      </aside>
      <div
        inert={comparing}
        className={`main-view ${expanded ? "mri-expanded" : ""}`}
      >
        <div className="view-heading">
          <h1>
            {sample
              ? "Brain atlas"
              : caseContext
                ? `${caseContext.study.participant} ${caseContext.study.session}`
                : "Loaded study"}{" "}
            <span className="meta">
              / {MODES.find((x) => x[0] === layout)?.[1]}
            </span>
          </h1>
          <button
            className="btn icon"
            aria-label={expanded ? "Exit expanded view" : "Expand MRI view"}
            title={expanded ? "Exit expanded view (Escape)" : "Expand MRI view"}
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </button>
          <span className="badge">
            {radiological ? "RADIOLOGICAL" : "NEUROLOGICAL"}
          </span>
        </div>
        <div className="toolbar">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`btn icon ${tool === t.id ? "active" : ""}`}
              disabled={!ready || !layers.length}
              onClick={() => setTool(t.id)}
              title={`${t.label} (${t.key})`}
              aria-label={t.label}
              aria-pressed={tool === t.id}
            >
              <t.Icon />
            </button>
          ))}
          <span className="separator" />
          <Choice
            label="MRI layout"
            value={layout}
            options={MODES}
            onChange={(v) => {
              setLayout(v);
              controller.current?.setLayout(Number(v));
            }}
          />
          <span className="spacer" />
          {collection && (
            <button
              className="btn small"
              onClick={() => {
                controller.current?.capture();
                setPlaying(false);
                setExpanded(false);
                setComparing(true);
              }}
            >
              Compare
            </button>
          )}
          <button
            className="btn small"
            onClick={() => {
              controller.current?.capture();
              setLibraryOpen(true);
            }}
          >
            Collections
          </button>
          <button
            className="btn icon"
            aria-label="Reset view"
            title="Reset view (R)"
            onClick={reset}
          >
            <RotateCcw />
          </button>
          <button
            className="btn icon"
            disabled={!layers.length}
            aria-label="Export MRI image"
            title="Export PNG image"
            onClick={() =>
              run("Exporting image…", async () => {
                await nv.current?.saveScene("nmrview-mri.png");
              })
            }
          >
            <Download />
          </button>
        </div>
        <div
          className="canvas-wrap"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            importFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <canvas
            ref={canvas}
            className="volume-canvas"
            aria-label="Interactive MRI slice and volume viewer"
            tabIndex={0}
          />
          {busy && (
            <div className="loading" role="status">
              <Brain />
              <span>{busy}</span>
            </div>
          )}
          {error && !busy && (
            <div className="viewer-error" role="alert">
              {error}
              <button className="btn small" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {ready &&
            layers.length > 0 &&
            layers.every((v) => v.opacity === 0) &&
            !busy && (
              <div className="loading" role="status">
                <EyeOff />
                <span>All MRI layers are hidden</span>
                <button className="btn primary" onClick={restoreImages}>
                  Show images
                </button>
              </div>
            )}
          {ready && !layers.length && (
            <div className="loading">
              <Brain />
              <span>Open a scan to begin</span>
              <button
                className="btn primary"
                onClick={() => setShowImport(true)}
              >
                Import MRI scans
              </button>
            </div>
          )}
        </div>
        <div className="view-bottom">
          <button
            className={`btn small ${viewMode === "fit" ? "active" : ""}`}
            disabled={!layers.length || !!busy}
            onClick={() => controller.current?.fit()}
            title="Fit the complete reference image; keep fitting when the viewport resizes"
          >
            {viewMode === "fit" ? "Fit image ✓" : "Fit image"}
          </button>
          <span className="view-mode" role="status">
            {viewMode === "manual" ? "Manual zoom" : "Auto fit"}
          </span>
          <button
            className="btn small"
            disabled={!layers.length || !!busy}
            title="Restore centered slices, base-layer visibility and automatic contrast without removing scans or annotations"
            onClick={restoreImages}
          >
            Restore images
          </button>
          <button
            className={`btn icon ${playing ? "active" : ""}`}
            disabled={!layers.length}
            aria-label={playing ? "Pause slices" : "Play slices"}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause /> : <Play />}
          </button>
          <span className="mono">{TOOL_LABEL(tool)}</span>
          <span className="spacer" />
          <span className="mono">
            {mm
              .map((v, i) => `${["X", "Y", "Z"][i]} ${v.toFixed(1)}`)
              .join("  ")}{" "}
            mm
          </span>
        </div>
      </div>
      <aside
        inert={comparing}
        className={`panel right-panel ${panel === "controls" ? "mobile-open" : ""}`}
      >
        <div className="panel-head">
          <span>
            <SlidersHorizontal />
            Display controls
          </span>
          <button
            className="btn icon ghost mobile-toggle"
            aria-label="Close controls"
            onClick={onClosePanel}
          >
            <X />
          </button>
        </div>
        <div className="panel-section">
          <p className="eyebrow">Active layer</p>
          <h2 className="study-title" style={{ overflowWrap: "anywhere" }}>
            {selectedLayer?.name
              .replace(/\.nii(\.gz)?$/, "")
              .replaceAll("_", " ") || "No layer selected"}
          </h2>
          {selectedLayer && (
            <>
              <p className="meta">
                Source voxels:{" "}
                {selectedLayer.spacing
                  .map((v) => Number(v.toFixed(3)))
                  .join(" × ")}{" "}
                mm · {selectedLayer.dims.join(" × ")}
              </p>
              <div className="control">
                <label>Image sampling</label>
                <Choice
                  label="Image sampling"
                  value={nearest ? "native" : "smooth"}
                  options={[
                    ["smooth", "Smooth (linear)"],
                    ["native", "Native voxels (no smoothing)"],
                  ]}
                  onChange={(v) => {
                    setNearest(v === "native");
                    nv.current?.setInterpolation(v === "native");
                  }}
                />
              </div>
              <p className="meta">
                Use a single-plane layout and expand the view to inspect detail.
                Native voxels show the source resolution; they do not add
                detail.
              </p>
              <div className="control">
                <label>Color map</label>
                <Choice
                  label="MRI color map"
                  value={selectedLayer.colormap}
                  options={[
                    "gray",
                    "warm",
                    "cool",
                    "hot",
                    "red",
                    "green",
                    "blue",
                    "viridis",
                    "plasma",
                  ].map((s) => [s, s[0].toUpperCase() + s.slice(1)])}
                  onChange={(v) => setLayer(selected, { colormap: v })}
                />
              </div>
              <div className="pair">
                <label className="meta">
                  Window width
                  <input
                    className="field"
                    aria-label="Window width"
                    type="number"
                    min="0.001"
                    value={Number(
                      (selectedLayer.max - selectedLayer.min).toFixed(3),
                    )}
                    onChange={(e) => {
                      const w = Number(e.target.value);
                      if (w > 0) {
                        const c = (selectedLayer.min + selectedLayer.max) / 2;
                        setLayer(selected, { min: c - w / 2, max: c + w / 2 });
                      }
                    }}
                  />
                </label>
                <label className="meta">
                  Level
                  <input
                    className="field"
                    aria-label="Window level"
                    type="number"
                    value={Number(
                      ((selectedLayer.min + selectedLayer.max) / 2).toFixed(3),
                    )}
                    onChange={(e) => {
                      const c = Number(e.target.value),
                        w = selectedLayer.max - selectedLayer.min;
                      if (Number.isFinite(c))
                        setLayer(selected, { min: c - w / 2, max: c + w / 2 });
                    }}
                  />
                </label>
              </div>
              <button
                className="btn small wide"
                style={{ marginTop: 10 }}
                onClick={() => {
                  const v = nv.current?.volumes.find((v) => v.id === selected);
                  if (v)
                    setLayer(selected, {
                      min: v.robust_min,
                      max: v.robust_max,
                    });
                }}
              >
                Auto contrast
              </button>
            </>
          )}
          <Range
            label="Gamma"
            min={0.2}
            max={3}
            step={0.05}
            value={gamma}
            digits={2}
            onChange={(v) => {
              setGamma(v);
              nv.current?.setGamma(v);
            }}
          />
          <Range
            label="Zoom"
            min={0.5}
            max={4}
            step={0.05}
            value={zoom}
            unit="×"
            digits={2}
            onChange={(v) => {
              controller.current?.setZoom(v);
            }}
          />
        </div>
        <div className="panel-section">
          <p className="eyebrow">Slice navigation</p>
          {["Sagittal · X", "Coronal · Y", "Axial · Z"].map((label, i) => (
            <Range
              key={label}
              label={label}
              min={0}
              max={Math.max(1, dims[i] - 1)}
              value={Math.round(pos[i] * (dims[i] - 1))}
              onChange={(v) => move(i, v / Math.max(1, dims[i] - 1))}
            />
          ))}
          {selectedLayer && selectedLayer.frames > 1 && (
            <Range
              label="Time frame"
              min={0}
              max={selectedLayer.frames - 1}
              value={selectedLayer.frame}
              onChange={(v) => {
                nv.current?.setFrame4D(selected, v);
                sync();
              }}
            />
          )}
          <Range
            label="Playback speed"
            min={1}
            max={24}
            value={fps}
            unit=" fps"
            onChange={setFps}
          />
          <div className="switch-row">
            <span>Crosshair</span>
            <Switch
              aria-label="Crosshair visibility"
              checked={cross}
              onCheckedChange={(v) => {
                setCross(v);
                if (nv.current) {
                  nv.current.opts.show3Dcrosshair = v;
                  nv.current.setCrosshairWidth(v ? 0.5 : 0);
                }
              }}
            />
          </div>
          <div className="switch-row">
            <span>Radiological orientation</span>
            <Switch
              aria-label="Radiological orientation"
              checked={radiological}
              onCheckedChange={(v) => {
                setRadiological(v);
                nv.current?.setRadiologicalConvention(v);
              }}
            />
          </div>
          <div className="switch-row">
            <span>Scale ruler</span>
            <Switch
              aria-label="Scale ruler"
              checked={ruler}
              onCheckedChange={(v) => {
                setRuler(v);
                if (nv.current) {
                  nv.current.opts.isRuler = v;
                  nv.current.drawScene();
                }
              }}
            />
          </div>
          <Range
            label="3D clipping plane"
            value={clip}
            min={-1}
            max={2}
            step={0.02}
            digits={2}
            onChange={(v) => {
              setClip(v);
              nv.current?.setClipPlane([v, 0, 0]);
            }}
          />
        </div>
        {caseContext ? (
          <div className="panel-section">
            <ScanAnnotations
              getViewer={() => nv.current}
              ready={ready}
              source={annotationSource(caseContext.source)}
              name={caseContext.source.name}
              active={!comparing && active}
              onLocate={(slice) => setLayout(String(slice))}
            />
          </div>
        ) : (
          <div className="panel-section">
            <p className="eyebrow">Measurements & labels</p>
            <p className="hint">
              Distance: drag between two points. Angle: draw two connected
              lines. Results use physical millimetres from the image header.
            </p>
            {measurements.map((m, i) => (
              <div className="annotation" key={i}>
                <Ruler size={14} />
                <span>
                  {"distance" in m
                    ? `${m.distance.toFixed(2)} mm`
                    : `${m.angle.toFixed(1)}°`}
                </span>
                <button
                  className="btn small ghost"
                  onClick={() => {
                    const n = nv.current;
                    if (n) {
                      n.scene.crosshairPos = Array.from(
                        n.mm2frac(
                          "distance" in m ? m.startMM : m.firstLineMM.start,
                        ),
                      ) as [number, number, number];
                      n.setSliceType(m.sliceType);
                      setLayout(String(m.sliceType));
                      n.drawScene();
                      setPos(Array.from(n.scene.crosshairPos));
                    }
                  }}
                >
                  Locate
                </button>
              </div>
            ))}
            {measurements.length > 0 && (
              <div className="full-row" style={{ marginTop: 10 }}>
                <button
                  className="btn small"
                  onClick={() =>
                    downloadBlob(
                      JSON.stringify(measurements, null, 2),
                      "nmrview-measurements.json",
                    )
                  }
                >
                  <FileDown />
                  Export
                </button>
                <button
                  className="btn small"
                  onClick={() => {
                    nv.current?.clearAllMeasurements();
                    setMeasurements([]);
                  }}
                >
                  Clear
                </button>
              </div>
            )}
            <div className="control">
              <label>Drawing label</label>
              <Choice
                label="Drawing label"
                value={pen}
                options={[
                  ["1", "1 · Red"],
                  ["2", "2 · Green"],
                  ["3", "3 · Blue"],
                  ["4", "4 · Yellow"],
                ]}
                onChange={setPen}
              />
            </div>
            <Range
              label="Label opacity"
              value={drawOpacity * 100}
              unit="%"
              onChange={(v) => {
                setDrawOpacity(v / 100);
                nv.current?.setDrawOpacity(v / 100);
              }}
            />
            <div className="full-row">
              <button
                className="btn small"
                title="Undo drawing"
                onClick={() => nv.current?.drawUndo()}
              >
                <Undo2 />
                Undo
              </button>
              <button
                className="btn small"
                onClick={() =>
                  run("Exporting label map…", async () => {
                    if (!nv.current?.drawBitmap)
                      throw new Error("Draw a label on a slice first.");
                    await nv.current.saveImage({
                      filename: "nmrview-labels.nii.gz",
                      isSaveDrawing: true,
                      volumeByIndex: 0,
                    });
                  })
                }
              >
                <Download />
                Labels
              </button>
            </div>
          </div>
        )}
        {selectedLayer && (
          <div className="panel-section">
            <p className="eyebrow">Acquisition metadata</p>
            <dl className="info-grid">
              <dt>Matrix</dt>
              <dd>{selectedLayer.dims.join(" × ")}</dd>
              <dt>Voxel size</dt>
              <dd>
                {selectedLayer.spacing
                  .map((v) => Math.abs(v).toFixed(1))
                  .join(" × ")}
              </dd>
              <dt>Spacing units</dt>
              <dd>mm*</dd>
              <dt>Frames</dt>
              <dd>{selectedLayer.frames}</dd>
            </dl>
            <p className="hint">
              *Verify physical units and orientation against the original
              acquisition before using measurements.
            </p>
          </div>
        )}
      </aside>
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent>
          <DialogTitle>Import MRI scans</DialogTitle>
          <DialogDescription>
            Files are read locally. Select a complete series for DICOM.
          </DialogDescription>
          <div className="dialog-body">
            <RepositoryBrowser
              key={
                assistantRecord
                  ? `${assistantRecord.provider}:${assistantRecord.id}`
                  : "manual"
              }
              initialRecord={assistantRecord}
              mode="mri"
              onDocumentation={setDocumentation}
              onCollection={(value) => {
                setCollection(value);
                setDocumentation(value.documentation);
                setShowImport(false);
                setExpanded(false);
                setComparing(true);
                setPlaying(false);
              }}
              onLoad={async (files, _source, replace) => {
                await importFiles(files, replace);
              }}
            />
            <div className="data-choice">
              <h3>Volumes or DICOM files</h3>
              <p>
                NIfTI .nii / .nii.gz, NRRD, MGH/MGZ, or multiple DICOM slices.
                Up to 512 MB per import.
              </p>
              <button
                className="btn primary"
                disabled={!ready || !!busy}
                onClick={() => files.current?.click()}
              >
                <Plus />
                Choose files
              </button>
              <button
                className="btn"
                style={{ marginLeft: 8 }}
                disabled={!ready || !!busy}
                onClick={() => folder.current?.click()}
              >
                <FolderOpen />
                DICOM folder
              </button>
            </div>
            <p>
              Adding your first scan replaces the example study. Later imports
              become layers. Use aligned scans from the same subject; overlays
              are not automatically registered.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function TOOL_LABEL(id: string) {
  return TOOLS.find((t) => t.id === id)?.label || id;
}
