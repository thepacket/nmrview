"use client";
import { useState } from "react";
import type { StructureDot } from "@/lib/assistant/protocol";
import type { ScanSnapshot } from "@/lib/assistant/scan";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function AssistantLocalization({
  snapshot,
  dots,
}: {
  snapshot: ScanSnapshot;
  dots: StructureDot[];
}) {
  const [visible, setVisible] = useState(false),
    [expanded, setExpanded] = useState(false);
  const image = () => (
    <div className="assistant-localization-image">
      <img src={snapshot.image} alt={`Captured MRI: ${snapshot.label}`} />
      {visible &&
        dots.map((dot, i) => (
          <span
            className="assistant-dot"
            key={i}
            style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }}
            title={dot.label}
            aria-label={`Location ${i + 1}: ${dot.label}`}
          >
            {i + 1}
          </span>
        ))}
    </div>
  );
  return (
    <section aria-label="AI structure localization">
      <p>Proposed structure locations · {snapshot.label}</p>
      <p className="hint">
        Approximate AI suggestions on the captured image. Review anatomy before
        using them. Dots stay on this snapshot when you change slices.
      </p>
      <div className="full-row">
        <button
          className="btn small"
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? "Hide dots" : "Show proposed dots"}
        </button>
        <button className="btn small" onClick={() => setExpanded(true)}>
          Enlarge image
        </button>
      </div>
      {image()}
      <ol>
        {dots.map((dot, i) => (
          <li key={i}>{dot.label}</li>
        ))}
      </ol>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="assistant-localization-dialog">
          <DialogTitle>AI structure locations</DialogTitle>
          <DialogDescription>
            {snapshot.label} · captured{" "}
            {new Date(snapshot.capturedAt).toLocaleString()}. Approximate
            suggestions, not validated annotations.
          </DialogDescription>
          {image()}
          <button className="btn small" onClick={() => setVisible(!visible)}>
            {visible ? "Hide dots" : "Show proposed dots"}
          </button>
          <ol>
            {dots.map((dot, i) => (
              <li key={i}>{dot.label}</li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </section>
  );
}
