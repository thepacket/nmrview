"use client";
import { useEffect, useRef, useState } from "react";
import { MRSClient, type MRSMap } from "@/lib/nmr/mrs-client";
import {
  type MRSInfo,
  type Processing,
  defaultProcessing,
  acquisitionMetadata,
} from "@/lib/nmr/mrs";
import { type Spectrum, COLORS, baselineEstimate } from "@/lib/nmr/spectrum";
import { parseBasis, type Basis, type fitBasis } from "@/lib/nmr/basis";
import { downloadPublic } from "@/lib/repositories";
import { captureScanSource, availableScanSources } from "@/lib/assistant/scan";
import { MetadataValue } from "./case-documentation";
import { zipSync, strToU8 } from "fflate";
import { downloadBlob } from "./controls";
import { MRSPlot } from "./mrs-plot";
import { MRSAnatomy } from "./mrs-anatomy";
import { SpectrumReview } from "./spectrum-review";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  discoverMRSSupport,
  type MRSSupport,
} from "@/lib/nmr/supporting-files";
export function MRSWorkspace({ active }: { active: boolean }) {
  const [support, setSupport] = useState<MRSSupport | null>(null);
  const [supportStatus, setSupportStatus] = useState("");
  const [qualityReview, setQualityReview] = useState<{
    key: string;
    report: object;
  } | null>(null);
  const [showComponents, setShowComponents] = useState(false);
  const [pinMetadata, setPinMetadata] = useState<object[]>([]);
  const [assumeUnits, setAssumeUnits] = useState(false);
  const [map, setMap] = useState<MRSMap | null>(null),
    [component, setComponent] = useState(""),
    [denominator, setDenominator] = useState("");
  const client = useRef<MRSClient | null>(null),
    abort = useRef<AbortController | null>(null),
    generation = useRef(0);
  const [url, setUrl] = useState(""),
    [info, setInfo] = useState<MRSInfo | null>(null),
    [selection, setSelection] = useState([0, 0, 0, 0, 0, 0]),
    [p, setP] = useState<Processing>(defaultProcessing),
    [spectrum, setSpectrum] = useState<Spectrum | null>(null),
    [pins, setPins] = useState<Spectrum[]>([]),
    [range, setRange] = useState<[number, number]>([0, 5]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [review, setReview] = useState(false),
    [baseline, setBaseline] = useState(false),
    [basisURL, setBasisURL] = useState(""),
    [basis, setBasis] = useState<Basis | null>(null),
    [fit, setFit] = useState<ReturnType<typeof fitBasis> | null>(null),
    [fitConfirmed, setFitConfirmed] = useState(false);
  useEffect(
    () => () => {
      client.current?.dispose();
      abort.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!info || !client.current) return;
    let stale = false;
    const token = ++generation.current;
    setBusy("Processing spectrum…");
    setFit(null);
    setMap(null);
    client.current
      .spectrum(selection, p)
      .then((s) => {
        if (!stale) {
          if (baseline) s.baseline = baselineEstimate(s);
          setSpectrum(s);
          setError("");
        }
      })
      .catch((e) => {
        if (!stale) {
          setSpectrum(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (token === generation.current) setBusy("");
      });
    return () => {
      stale = true;
    };
  }, [info, selection, p, baseline]);
  useEffect(() => {
    setSupport(null);
    if (!info) {
      setSupportStatus("");
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let current = true;
    setSupportStatus(
      "Checking the source for optional acquisition notes and a matching basis…",
    );
    discoverMRSSupport(info, controller.signal)
      .then((found) => {
        if (!current) return;
        setSupport(found);
        setSupportStatus(found.message);
        if (found.basis) {
          setBasis(found.basis);
          setBasisURL(found.basisURL || "");
          setComponent(found.basis.components[0].name);
          setDenominator("");
          setFitConfirmed(false);
        }
      })
      .catch(() => {
        if (current)
          setSupportStatus(
            "Optional file lookup could not finish. Your spectrum is still available; you can supply a basis below.",
          );
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      current = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [info]);
  async function load() {
    abort.current?.abort();
    const a = new AbortController();
    abort.current = a;
    const timeout = setTimeout(() => a.abort(), 60000);
    setBusy("Downloading NIfTI-MRS…");
    setError("");
    let next: MRSClient | null = null;
    try {
      const blob = await downloadPublic(url, 64 * 1024 * 1024, a.signal);
      next = new MRSClient();
      const data = await next.load(
        blob,
        new URL(url).pathname
          .split("/")
          .filter((v) => v !== "content")
          .pop() || "MRS",
        url,
        assumeUnits,
      );
      client.current?.dispose();
      client.current = next;
      next = null;
      setSpectrum(null);
      setQualityReview(null);
      setPins([]);
      setPinMetadata([]);
      setSelection([0, 0, 0, 0, 0, 0]);
      setP({
        ...defaultProcessing,
        reference: data.nucleus === "1H" ? 4.65 : 0,
      });
      setBaseline(false);
      setFit(null);
      setBasis(null);
      setBasisURL("");
      setFitConfirmed(false);
      setInfo(data);
      setRange(data.nucleus === "1H" ? [0, 5] : [-20, 20]);
    } catch (e) {
      next?.dispose();
      setError((e as Error).message);
    } finally {
      clearTimeout(timeout);
      setBusy("");
    }
  }
  async function loadBasis() {
    const a = new AbortController();
    abort.current = a;
    const timeout = setTimeout(() => a.abort(), 30000);
    setBusy("Reading basis…");
    setError("");
    try {
      const blob = await downloadPublic(basisURL, 8 * 1024 * 1024, a.signal);
      const b = parseBasis(JSON.parse(await blob.text()));
      setBasis(b);
      setComponent(b.components[0].name);
      setDenominator("");
      setMap(null);
      setFit(null);
      setFitConfirmed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      clearTimeout(timeout);
      setBusy("");
    }
  }
  async function runFit() {
    if (!client.current || !info || !basis || !fitConfirmed) return;
    setBusy("Fitting basis…");
    setError("");
    setFit(null);
    try {
      const resolved = acquisitionMetadata(info, selection);
      const te = resolved.EchoTime,
        seq = resolved.SequenceName;
      if (
        JSON.stringify(resolved.SpectrometerFrequency) !==
          JSON.stringify(info.metadata.SpectrometerFrequency) ||
        JSON.stringify(resolved.ResonantNucleus) !==
          JSON.stringify(info.metadata.ResonantNucleus)
      )
        throw new Error(
          "Variable frequency/nucleus acquisitions require separate files for fitting.",
        );
      if (
        typeof te !== "number" ||
        Math.abs(te - basis.echoTimeSeconds) > 1e-6 ||
        typeof seq !== "string" ||
        seq !== basis.sequence
      )
        throw new Error(
          "Basis EchoTime and SequenceName must exactly match acquisition metadata.",
        );
      if (baseline)
        throw new Error(
          "Disable edge baseline correction: fitting estimates its own baseline.",
        );
      setFit(await client.current.fit(selection, p, basis, range));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function runMap() {
    if (!client.current || !basis || !fit || !info) return;
    setBusy("Fitting map slice…");
    setError("");
    setMap(null);
    try {
      setMap(
        await client.current.map(
          selection,
          p,
          basis,
          range,
          component,
          denominator,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function exportBundle() {
    const files: Record<string, Uint8Array> = {
      "review.json": strToU8(
        JSON.stringify(
          {
            ...metadata,
            fit,
            map,
            basis: basis
              ? {
                  ...basis,
                  components: basis.components.map(({ name }) => ({ name })),
                }
              : null,
          },
          null,
          2,
        ),
      ),
    };
    for (const [selector, name] of [
      [".mrs-spectrum-plot", "spectrum.png"],
      ['canvas[aria-label="MRS voxel on matching anatomy"]', "anatomy.png"],
    ]) {
      const c = document.querySelector<HTMLCanvasElement>(selector);
      if (c && c.width) {
        const raw = atob(c.toDataURL("image/png").split(",")[1]);
        files[name] = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      }
    }
    if (availableScanSources().some((s) => s.id === "mrs-anatomy")) {
      const shot = captureScanSource("mrs-anatomy");
      files["anatomy.jpg"] = Uint8Array.from(
        atob(shot.image.split(",")[1]),
        (c) => c.charCodeAt(0),
      );
      delete files["anatomy.png"];
    }
    if (spectrum)
      files["spectrum.csv"] = strToU8(
        "ppm,intensity\n" +
          spectrum.x
            .map(
              (x, i) =>
                `${x},${spectrum.y[i] - (spectrum.baseline[0] * x + spectrum.baseline[1])}`,
            )
            .join("\n"),
      );
    const zip = zipSync(files);
    downloadBlob(
      new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }),
      "nmrview-mrs-review.zip",
    );
  }
  const traces = spectrum ? [spectrum, ...pins] : [];
  if (fit && spectrum) {
    traces.push({
      ...spectrum,
      id: "fit",
      name: "Basis fit",
      x: fit.x,
      y: fit.fitted,
      baseline: [0, 0],
      color: "#f4be61",
    });
    traces.push({
      ...spectrum,
      id: "residual",
      name: "Fit residual",
      x: fit.x,
      y: fit.residual,
      baseline: [0, 0],
      color: "#e58ac7",
    });
  }
  if (fit && spectrum && showComponents) {
    traces.push({
      ...spectrum,
      id: "fit-baseline",
      name: "Fitted baseline",
      x: fit.x,
      y: fit.baseline,
      baseline: [0, 0],
      color: "#b7c2ce",
    });
    fit.components.forEach((c, i) =>
      traces.push({
        ...spectrum,
        id: "component-" + i,
        name: c.name,
        x: fit.x,
        y: c.y,
        baseline: [0, 0],
        color: COLORS[(i + 1) % COLORS.length],
      }),
    );
  }
  const metadata = {
    supportingDocumentation: support?.notes,
    supportingDocumentationURL: support?.notesURL,
    acquisition: info,
    comparisons: pinMetadata,
    selection,
    processing: { ...p, edgeBaseline: baseline },
    quality:
      qualityReview?.key ===
      JSON.stringify([info?.source, selection, p, baseline])
        ? qualityReview.report
        : null,
    fit: fit
      ? {
          method: fit.method,
          rmse: fit.rmse,
          components: fit.components.map(
            ({ name, amplitude, standardError }) => ({
              name,
              amplitude,
              standardError,
            }),
          ),
        }
      : null,
  };
  return (
    <section className="mrs-workspace" aria-label="Tissue MR spectroscopy">
      <div className="mrs-image-area">
        <div className="view-heading">
          <h1>Tissue MR spectroscopy</h1>
          <span className="badge">{info ? info.nucleus : "NIfTI-MRS"}</span>
        </div>
        <div className="toolbar">
          <button
            className="btn"
            disabled={!spectrum || !!busy}
            onClick={() => setReview(true)}
          >
            Analysis & quality
          </button>
          <button
            className="btn"
            disabled={!spectrum || pins.length >= 3 || !!busy}
            onClick={() => {
              setPinMetadata([
                ...pinMetadata,
                {
                  selection: [...selection],
                  processing: { ...p, edgeBaseline: baseline },
                  name: spectrum?.name,
                  source: info?.source,
                },
              ]);
              setPins([
                ...pins,
                {
                  ...spectrum!,
                  id: crypto.randomUUID(),
                  color: COLORS[pins.length + 1],
                },
              ]);
            }}
          >
            Pin for comparison
          </button>
          <button
            className="btn"
            disabled={!pins.length}
            onClick={() => {
              setQualityReview(null);
              setPins([]);
              setPinMetadata([]);
            }}
          >
            Clear comparison
          </button>
          <button
            className="btn"
            disabled={!spectrum}
            onClick={() => {
              const c =
                document.querySelector<HTMLCanvasElement>(".mrs-spectrum-plot");
              if (c) {
                const a = document.createElement("a");
                a.href = c.toDataURL("image/png");
                a.download = "nmrview-mrs-spectrum.png";
                a.click();
              }
            }}
          >
            Export plot
          </button>
        </div>
        {spectrum ? (
          <>
            <MRSPlot
              active={active && !busy}
              spectra={traces}
              range={range}
              onRange={(r) => {
                if (busy) return;
                setRange(r);
                setFit(null);
                setMap(null);
              }}
              metadata={metadata}
            />
            <div className="mrs-legend">
              {traces.map((t) => (
                <span key={t.id} style={{ color: t.color }}>
                  {t.name}
                </span>
              ))}
            </div>
            <p className="hint">
              Shared amplitude scale · Drag to zoom · Double-click to fit ·
              Water receiver reference is editable; verify it before peak
              assignments.
            </p>
          </>
        ) : (
          <div className="mrs-empty">
            <h2>Inspect spatially localized spectra</h2>
            <p>
              Load a public NIfTI-MRS file from Zenodo or OpenNeuro S3 using its
              direct download URL. Complex data are processed in your browser.
            </p>
            <p>
              Only the NIfTI-MRS acquisition is required to view, phase, compare
              and export spectra. A basis set is optional for metabolite
              fitting; a matching MRI is optional for anatomical localization.
            </p>
            <p>
              Coils, dynamics and editing conditions are selected individually;
              they are never silently averaged.
            </p>
          </div>
        )}
        {busy && <p role="status">{busy}</p>}
        {error && (
          <p role="alert" className="mrs-error">
            {error}
          </p>
        )}
        {map && (
          <section>
            <h3>
              {map.component}
              {map.denominator ? ` / ${map.denominator}` : " amplitude"} map ·
              slice {map.z + 1}
            </h3>
            <p className="hint">
              Acquisition grid: X increases right, Y increases down. Not an
              anatomical orientation. Gray cells are failed or below three
              approximate standard errors. Select a cell to inspect its
              spectrum.
            </p>
            <div
              className="mrs-map"
              style={{ gridTemplateColumns: `repeat(${map.nx},minmax(0,1fr))` }}
            >
              {map.values.map((v, i) => (
                <button
                  key={i}
                  className="btn"
                  aria-label={`Voxel ${(i % map.nx) + 1},${Math.floor(i / map.nx) + 1}: ${map.valid[i] ? v.toPrecision(3) : "masked"}`}
                  style={{
                    background: map.valid[i]
                      ? `hsl(${180 - (140 * v) / Math.max(...map.values, 1e-12)} 65% 30%)`
                      : "#30343b",
                  }}
                  onClick={() =>
                    setSelection([
                      i % map.nx,
                      Math.floor(i / map.nx),
                      ...selection.slice(2),
                    ])
                  }
                >
                  {map.valid[i] ? v.toPrecision(2) : "—"}
                </button>
              ))}
            </div>
            <button
              className="btn"
              onClick={() =>
                downloadBlob(
                  JSON.stringify(
                    {
                      map,
                      acquisition: info,
                      selection,
                      processing: p,
                      basis: basis?.source,
                      range,
                    },
                    null,
                    2,
                  ),
                  "nmrview-mrs-map.json",
                )
              }
            >
              Export map & geometry
            </button>
          </section>
        )}
        {info && (
          <details>
            <summary>Optional: show voxel on matching MRI anatomy</summary>
            <MRSAnatomy
              key={info.source + info.name}
              info={info}
              selection={selection}
              map={map}
            />
          </details>
        )}
      </div>
      <aside className="mrs-controls">
        <section>
          <h3>1. Load a spectrum</h3>
          <p className="hint">
            Required: one NIfTI-MRS file. Ordinary MRI images do not contain
            spectroscopy signals.
          </p>
          <label>
            Direct .nii / .nii.gz URL
            <input
              className="field"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://zenodo.org/records/…/files/…nii.gz"
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={assumeUnits}
              onChange={(e) => setAssumeUnits(e.target.checked)}
            />{" "}
            For missing header units only, I confirm dwell time is seconds and
            spatial units are mm
          </label>
          <div className="full-row">
            <button
              className="btn primary"
              disabled={!url || !!busy}
              onClick={load}
            >
              Load MRS
            </button>
            <button
              className="btn"
              disabled={!busy}
              onClick={() => {
                abort.current?.abort();
                client.current?.dispose();
                client.current = null;
                generation.current++;
                setInfo(null);
                setSpectrum(null);
                setFit(null);
                setBusy("");
                setError(
                  "Operation cancelled. Reload the acquisition to continue.",
                );
              }}
            >
              Cancel
            </button>
          </div>
          <p className="hint">
            64 MB download / 128 MB expanded maximum. Existing repository pacing
            applies.
          </p>
          <a
            href="https://zenodo.org/records/5085449"
            target="_blank"
            rel="noreferrer"
          >
            Official NIfTI-MRS examples and source documentation
          </a>
        </section>
        {info && (
          <>
            <section aria-label="Spectroscopy readiness">
              <h3>{spectrum ? "Spectrum ready" : "Acquisition loaded"}</h3>
              <p className="hint">
                No additional files are needed for viewing, processing, quality
                review or export.
              </p>
              <p role="status" className="hint">
                {supportStatus}
              </p>
              {support?.notesURL && (
                <details>
                  <summary>Acquisition notes</summary>
                  <MetadataValue value={support.notes} />
                  <a href={support.notesURL} target="_blank" rel="noreferrer">
                    Source documentation
                  </a>
                </details>
              )}
            </section>
            <section>
              <h3>Voxel & acquisition</h3>
              {selection.map((v, i) => {
                const d = i < 3 ? i : i + 1;
                return (
                  <label key={i}>
                    {i < 3
                      ? ["Voxel X", "Voxel Y", "Voxel Z"][i]
                      : String(
                          info.metadata[`dim_${i + 2}`] || `Dimension ${i + 2}`,
                        )}{" "}
                    (1–{info.dims[d]})
                    <input
                      className="field"
                      type="number"
                      min="1"
                      max={info.dims[d]}
                      value={v + 1}
                      disabled={!!busy}
                      onChange={(e) => {
                        const n = Number(e.target.value) - 1;
                        if (Number.isInteger(n) && n >= 0 && n < info.dims[d])
                          setSelection(
                            selection.map((old, j) => (i === j ? n : old)),
                          );
                      }}
                    />
                  </label>
                );
              })}
              <p className="hint">
                {info.frequency.toFixed(4)} MHz · dwell{" "}
                {(info.dwell * 1000).toFixed(4)} ms · {info.dims[3]} complex
                samples
              </p>
            </section>
            <section>
              <h3>Reversible processing</h3>
              {(
                [
                  ["phase0", "Zero-order phase (°)", -360, 360, 1],
                  [
                    "phase1",
                    "First-order phase across spectrum (°)",
                    -720,
                    720,
                    1,
                  ],
                  [
                    "broadening",
                    "Exponential line broadening (Hz)",
                    0,
                    100,
                    0.1,
                  ],
                  ["reference", "Receiver reference (ppm)", -1000, 1000, 0.01],
                  ["shift", "Frequency shift (ppm)", -100, 100, 0.001],
                ] as const
              ).map(([key, label, min, max, step]) => (
                <label key={key}>
                  {label}
                  <input
                    className="field"
                    type="number"
                    min={min}
                    max={max}
                    step={step}
                    value={p[key]}
                    disabled={!!busy}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n) && n >= min && n <= max)
                        setP({ ...p, [key]: n });
                    }}
                  />
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={baseline}
                  disabled={!!busy}
                  onChange={(e) => setBaseline(e.target.checked)}
                />{" "}
                Linear edge baseline
              </label>
              <button
                className="btn"
                disabled={!!busy}
                onClick={() => {
                  setP({
                    ...defaultProcessing,
                    reference: info.nucleus === "1H" ? 4.65 : 0,
                  });
                  setBaseline(false);
                }}
              >
                Reset processing
              </button>
              <p className="hint">
                Original FID retained. Forward FFT with first-point half
                weighting; zero filling to next power of two. No broadening by
                default. Phase pivot is spectrum center. No water removal or
                coil combination is applied.
              </p>
            </section>
            <details>
              <summary>
                Optional: metabolite fitting & maps
                {basis ? " · basis loaded" : " · basis needed"}
              </summary>
              <p className="hint">
                Add reference metabolite signals only if you want fitting or
                maps. Your spectrum works without them. NMRView checks up to
                three named basis JSON files in the source Zenodo record
                automatically.
              </p>
              <label>
                Online basis JSON URL
                <input
                  className="field"
                  value={basisURL}
                  onChange={(e) => setBasisURL(e.target.value)}
                />
              </label>
              <button
                className="btn"
                disabled={
                  !basisURL || !!busy || supportStatus.startsWith("Checking")
                }
                onClick={loadBasis}
              >
                Load basis
              </button>
              <p className="hint">
                Requires nmrview-basis-1 spectral templates with acquisition
                metadata. Fits fixed shapes and linear baseline; not a
                concentration estimator.
              </p>
              {basis && (
                <>
                  <p>
                    {basis.name} · {basis.components.length} components ·{" "}
                    {basis.frequencyMHz} MHz · TE {basis.echoTimeSeconds}s ·{" "}
                    {basis.sequence}
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={fitConfirmed}
                      onChange={(e) => setFitConfirmed(e.target.checked)}
                    />{" "}
                    I verified acquisition, basis processing and amplitude
                    conventions
                  </label>
                  <button
                    className="btn"
                    disabled={!fitConfirmed || !!busy}
                    onClick={runFit}
                  >
                    Fit visible ppm interval
                  </button>
                </>
              )}
              {fit && (
                <>
                  <p>RMSE {fit.rmse.toPrecision(4)}</p>
                  <table>
                    <thead>
                      <tr>
                        <th>Component</th>
                        <th>Amplitude</th>
                        <th>Approx. SE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fit.components.map((c) => (
                        <tr key={c.name}>
                          <td>{c.name}</td>
                          <td>{c.amplitude.toPrecision(4)}</td>
                          <td>
                            {c.standardError?.toPrecision(3) ?? "At bound"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="hint">{fit.method}</p>
                  <label>
                    <input
                      type="checkbox"
                      checked={showComponents}
                      onChange={(e) => setShowComponents(e.target.checked)}
                    />{" "}
                    Show fitted components and baseline
                  </label>
                  <label>
                    Map component
                    <select
                      className="field"
                      value={component}
                      disabled={!!busy}
                      onChange={(e) => {
                        setComponent(e.target.value);
                        setMap(null);
                      }}
                    >
                      {basis?.components.map((c) => (
                        <option key={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ratio denominator
                    <select
                      className="field"
                      value={denominator}
                      disabled={!!busy}
                      onChange={(e) => {
                        setDenominator(e.target.value);
                        setMap(null);
                      }}
                    >
                      <option value="">None (amplitude)</option>
                      {basis?.components.map((c) => (
                        <option key={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="btn"
                    disabled={
                      !!busy ||
                      info.dims[0] * info.dims[1] > 256 ||
                      info.dims[0] * info.dims[1] < 2 ||
                      component === denominator
                    }
                    onClick={runMap}
                  >
                    Fit current map slice
                  </button>
                </>
              )}
            </details>
            <section>
              <h3>Review export</h3>
              <button
                className="btn"
                disabled={!spectrum}
                onClick={exportBundle}
              >
                Export complete review ZIP
              </button>
              <button
                className="btn"
                onClick={() =>
                  downloadBlob(
                    JSON.stringify(
                      { ...metadata, fit, basisSource: basis?.source },
                      null,
                      2,
                    ),
                    "nmrview-mrs-review.json",
                  )
                }
              >
                Export acquisition & analysis
              </button>
              <button
                className="btn"
                disabled={!spectrum}
                onClick={() =>
                  downloadBlob(
                    "ppm,intensity\n" +
                      spectrum!.x
                        .map(
                          (x, i) =>
                            `${x},${spectrum!.y[i] - (spectrum!.baseline[0] * x + spectrum!.baseline[1])}`,
                        )
                        .join("\n"),
                    "nmrview-mrs-spectrum.csv",
                    "text/csv",
                  )
                }
              >
                Export processed CSV
              </button>
              <details>
                <summary>Acquisition metadata</summary>
                <MetadataValue value={info.metadata} />
              </details>
            </section>
          </>
        )}
      </aside>
      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent className="spectroscopy-review-dialog">
          <DialogTitle>MRS quality review</DialogTitle>
          <DialogDescription>
            Assess selected voxel before interpreting results.
          </DialogDescription>
          {spectrum && (
            <SpectrumReview
              key={spectrum.name}
              s={spectrum}
              spectra={traces}
              peaks={[]}
              integrals={[]}
              onUpdate={() =>
                setError(
                  "MRS acquisition metadata and frequency are controlled by the original header and processing panel.",
                )
              }
              onReport={(report) =>
                setQualityReview({
                  key: JSON.stringify([info?.source, selection, p, baseline]),
                  report,
                })
              }
              readOnlyMetadata
              onPlot={() => {
                const c =
                  document.querySelector<HTMLCanvasElement>(
                    ".mrs-spectrum-plot",
                  );
                if (c) {
                  const a = document.createElement("a");
                  a.href = c.toDataURL("image/png");
                  a.download = "nmrview-mrs-spectrum.png";
                  a.click();
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
