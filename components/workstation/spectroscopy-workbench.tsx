"use client";
import { useEffect, useRef, useState } from "react";
import SpectraWorkspace from "./spectra";
import { TwoDSpectra } from "./two-d-spectra";
import { MRSWorkspace } from "./mrs";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
export default function SpectroscopyWorkbench(
  props: React.ComponentProps<typeof SpectraWorkspace>,
) {
  const [mode, setMode] = useState("lab");
  const root = useRef<HTMLDivElement>(null),
    previousImport = useRef(props.importTick);
  useEffect(() => {
    if (props.importTick === previousImport.current) return;
    previousImport.current = props.importTick;
    if (!props.active || mode === "lab") return;
    const section = root.current?.querySelector(
      mode === "mrs"
        ? '[aria-label="Tissue MR spectroscopy"]'
        : '[aria-label="2D laboratory NMR"]',
    );
    const browser = section?.querySelector<HTMLDetailsElement>(
      ".spectroscopy-browser",
    );
    if (browser) browser.open = true;
    const input = section?.querySelector<HTMLInputElement>(
      ".mrs-controls input",
    );
    input?.scrollIntoView({ block: "center" });
    input?.focus();
  }, [props.importTick, props.active, mode]);
  return (
    <div className="spectroscopy-shell" ref={root}>
      <Tabs value={mode} onValueChange={setMode}>
        <TabsList aria-label="Spectroscopy workflow">
          <TabsTrigger value="lab">Laboratory NMR</TabsTrigger>
          <TabsTrigger value="2d">2D NMR</TabsTrigger>
          <TabsTrigger value="mrs">Tissue MRS</TabsTrigger>
        </TabsList>
      </Tabs>
      <div style={{ display: mode === "lab" ? "contents" : "none" }}>
        <SpectraWorkspace {...props} active={props.active && mode === "lab"} />
      </div>
      <div style={{ display: mode === "mrs" ? "contents" : "none" }}>
        <MRSWorkspace active={props.active && mode === "mrs"} />
      </div>
      <div style={{ display: mode === "2d" ? "contents" : "none" }}>
        <TwoDSpectra active={props.active && mode === "2d"} />
      </div>
    </div>
  );
}
