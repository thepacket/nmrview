"use client";
import { useMemo, useState } from "react";
import { type Spectrum, type Peak, type Integral } from "@/lib/nmr/spectrum";
import {
  quality,
  waterRegionRatio,
  couplings,
  alignment,
  type Interval,
} from "@/lib/nmr/analysis";
import { downloadBlob } from "./controls";
import { zipSync, strToU8 } from "fflate";
import { toast } from "sonner";
export function SpectrumReview({
  s,
  spectra,
  peaks,
  integrals,
  onUpdate,
  onPlot,
  readOnlyMetadata = false,
  onReport,
  plotData,
}: {
  s: Spectrum;
  spectra: Spectrum[];
  peaks: Peak[];
  integrals: Integral[];
  onUpdate: (patch: Partial<Spectrum>) => void;
  onPlot: () => void;
  readOnlyMetadata?: boolean;
  onReport?: (report: object) => void;
  plotData?: () => string;
}) {
  const [water, setWater] = useState<Interval>([4.5, 4.9]);
  const [checkWater, setCheckWater] = useState(false);
  const span = s.x.at(-1)! - s.x[0];
  const [signal, setSignal] = useState<Interval>([
    s.x[0] + s.shift + span * 0.2,
    s.x[0] + s.shift + span * 0.8,
  ]);
  const [noise, setNoise] = useState<Interval>([
    s.x[0] + s.shift,
    s.x[0] + s.shift + span * 0.08,
  ]);
  const [reference, setReference] = useState(""),
    [maxShift, setMaxShift] = useState(0.05),
    [notes, setNotes] = useState(""),
    [undo, setUndo] = useState<number | null>(null);
  const q = useMemo(() => {
    try {
      return { value: quality(s, signal, noise), error: "" };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [s, signal, noise]);
  const waterResult = useMemo(() => {
    if (!checkWater) return null;
    try {
      return { value: waterRegionRatio(s, water, signal), error: "" };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [s, water, signal, checkWater]);
  const spacing = couplings(
    peaks
      .filter(
        (p) => p.spectrumId === s.id && p.x >= signal[0] && p.x <= signal[1],
      )
      .map((p) => p.x),
    s.frequency,
  );
  const fmt = (n: number | null | undefined) =>
    n == null ? "Unavailable" : n.toPrecision(5);
  function interval(label: string, v: Interval, set: (v: Interval) => void) {
    return (
      <fieldset>
        <legend>{label} (ppm)</legend>
        <div className="pair">
          {v.map((x, i) => (
            <input
              key={i}
              className="field"
              type="number"
              step=".01"
              aria-label={`${label} ${i ? "upper" : "lower"} ppm`}
              value={Number(x.toFixed(5))}
              onChange={(e) =>
                set(
                  v.map((n, j) =>
                    i === j ? Number(e.target.value) : n,
                  ) as Interval,
                )
              }
            />
          ))}
        </div>
      </fieldset>
    );
  }
  const report = () => ({
    format: "nmrview-spectroscopy-review-1",
    createdAt: new Date().toISOString(),
    spectrum: {
      name: s.name,
      source: s.source,
      nucleus: s.nucleus,
      frequencyMHz: s.frequency,
      solvent: s.solvent,
    },
    displayedSpectra: spectra
      .filter((s) => s.visible)
      .map(({ name, source }) => ({ name, source })),
    processing: {
      shiftPPM: s.shift,
      baseline: s.baseline,
      phase: s.phase || [0, 0],
      normalization:
        "Quality and integrals exclude display gain and normalization",
    },
    quality: q.value,
    qualityError: q.error,
    water: waterResult,
    candidateCouplings: spacing,
    peaks: peaks.filter((p) => p.spectrumId === s.id),
    integrals: integrals.filter((p) => p.spectrumId === s.id),
    notes,
  });
  return (
    <div className="spectrum-review">
      <section>
        <h3>Quality & line width</h3>
        <p className="hint">
          Choose an isolated positive signal and a separate signal-free noise
          region. Results use corrected data, before display scaling.
        </p>
        {interval("Signal region", signal, setSignal)}
        {interval("Noise region", noise, setNoise)}
        {q.error ? (
          <p role="status">{q.error}</p>
        ) : (
          <>
            <dl className="info-grid">
              <dt>Peak / noise SD</dt>
              <dd>{fmt(q.value?.snr)}</dd>
              <dt>Noise SD</dt>
              <dd>{fmt(q.value?.noiseSD)} a.u.</dd>
              <dt>Peak</dt>
              <dd>{fmt(q.value?.peakPPM)} ppm</dd>
              <dt>FWHM</dt>
              <dd>
                {fmt(q.value?.fwhmPPM)} ppm / {fmt(q.value?.fwhmHz)} Hz
              </dd>
              <dt>Noise samples</dt>
              <dd>{q.value?.noiseSamples}</dd>
            </dl>
            <p className="hint">{q.value?.method}</p>
          </>
        )}
      </section>
      {readOnlyMetadata && s.nucleus === "1H" && (
        <section>
          <h3>Residual water review</h3>
          <label>
            <input
              type="checkbox"
              checked={checkWater}
              onChange={(e) => setCheckWater(e.target.checked)}
            />{" "}
            Evaluate a water region
          </label>
          {checkWater && (
            <>
              {interval("Water region", water, setWater)}
              <p>
                {waterResult?.error ||
                  `Water / signal absolute peak ratio: ${fmt(waterResult?.value?.ratio)}`}
              </p>
              <p className="hint">{waterResult?.value?.method}</p>
            </>
          )}
        </section>
      )}
      <section>
        <h3>Acquisition & peak spacing</h3>
        <div className="pair">
          <label>
            Nucleus
            <input
              className="field"
              disabled={readOnlyMetadata}
              value={s.nucleus}
              maxLength={24}
              onChange={(e) => onUpdate({ nucleus: e.target.value })}
            />
          </label>
          <label>
            Observe frequency (MHz)
            <input
              className="field"
              disabled={readOnlyMetadata}
              type="number"
              min="0"
              step=".001"
              value={s.frequency ?? ""}
              onChange={(e) =>
                onUpdate({
                  frequency:
                    Number(e.target.value) > 0 ? Number(e.target.value) : null,
                })
              }
            />
          </label>
        </div>
        <p className="hint">
          Use acquisition metadata. Adjacent selected peak spacings within the
          signal region are candidate couplings, not automatic multiplet
          assignments.
        </p>
        {spacing.length ? (
          <table>
            <thead>
              <tr>
                <th>From ppm</th>
                <th>To ppm</th>
                <th>Spacing Hz</th>
              </tr>
            </thead>
            <tbody>
              {spacing.map((p, i) => (
                <tr key={i}>
                  <td>{p.from.toFixed(4)}</td>
                  <td>{p.to.toFixed(4)}</td>
                  <td>{p.hz.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">
            Pick at least two peaks in the signal region and supply a positive
            frequency to calculate Hz spacing.
          </p>
        )}
      </section>
      {!readOnlyMetadata && (
        <section>
          <h3>Comparison alignment</h3>
          <label>
            Reference spectrum
            <select
              className="field"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            >
              <option value="">Choose reference</option>
              {spectra
                .filter((v) => v.id !== s.id)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Maximum shift (ppm)
            <input
              className="field"
              type="number"
              min=".001"
              max="1"
              step=".01"
              value={maxShift}
              onChange={(e) => setMaxShift(Number(e.target.value))}
            />
          </label>
          <div className="full-row">
            <button
              className="btn"
              disabled={!reference || readOnlyMetadata}
              onClick={() => {
                try {
                  const r = spectra.find((v) => v.id === reference);
                  if (!r) return;
                  const a = alignment(s, r, signal, maxShift);
                  if (a.atBoundary || a.correlation < 0.8)
                    throw new Error(
                      `Alignment not applied: correlation ${a.correlation.toFixed(3)}${a.atBoundary ? ", search boundary reached" : ""}. Review region and acquisition.`,
                    );
                  setUndo(s.shift);
                  onUpdate({ shift: s.shift + a.shift });
                  toast.success(
                    `Shift ${a.shift.toFixed(5)} ppm; correlation ${a.correlation.toFixed(3)}`,
                  );
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Align selected region
            </button>
            <button
              className="btn"
              disabled={undo === null}
              onClick={() => {
                onUpdate({ shift: undo! });
                setUndo(null);
              }}
            >
              Undo alignment
            </button>
          </div>
          <p className="hint">
            Normalized cross-correlation over the signal region; maximum 201
            lags. Review the overlay. Shifting clears previous peak/integral
            analyses.
          </p>
        </section>
      )}
      <section>
        <h3>Review report</h3>
        <label>
          Operator notes
          <textarea
            className="field"
            rows={4}
            maxLength={12000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="full-row">
          <button className="btn" onClick={onPlot}>
            Export plot
          </button>
          <button
            className="btn"
            onClick={() =>
              downloadBlob(
                JSON.stringify(report(), null, 2),
                "nmrview-spectroscopy-review.json",
              )
            }
          >
            Export review JSON
          </button>
          {onReport && (
            <button
              className="btn"
              onClick={() => {
                onReport(report());
                toast.success(
                  "Quality and notes included in complete review export",
                );
              }}
            >
              Include in complete review
            </button>
          )}
          {plotData && (
            <button
              className="btn"
              onClick={() => {
                const zip = zipSync({
                  "review.json": strToU8(JSON.stringify(report(), null, 2)),
                  "spectrum.svg": strToU8(plotData()),
                });
                downloadBlob(
                  new Blob([zip.buffer as ArrayBuffer], {
                    type: "application/zip",
                  }),
                  "nmrview-spectroscopy-review.zip",
                );
              }}
            >
              Export review & plot ZIP
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
