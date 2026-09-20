"use client";
import { useState } from "react";
import {
  Activity,
  Brain,
  ChartNoAxesCombined,
  CircleHelp,
  LockKeyhole,
  Upload,
  SlidersHorizontal,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import MRIWorkspace from "@/components/workstation/mri";
import SpectraWorkspace from "@/components/workstation/spectra";
import { useWorkspaceTools } from "@/components/workstation/webmcp";
import { Toaster } from "@/components/ui/sonner";
export default function Home() {
  const [mode, setMode] = useState("mri"),
    [help, setHelp] = useState(false),
    [panel, setPanel] = useState(""),
    [importTick, setImportTick] = useState({ mri: 0, nmr: 0 });
  useWorkspaceTools(mode, setMode);
  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <Activity strokeWidth={1.8} />
          <span>
            NMR<span style={{ color: "#75deca" }}>View</span>
          </span>
          <span className="edition">Research workspace</span>
        </div>
        <Tabs
          className="mode-tabs"
          value={mode}
          onValueChange={(v) => {
            setMode(v);
            setPanel("");
          }}
        >
          <TabsList aria-label="Workspace">
            <TabsTrigger value="mri">
              <Brain />
              MRI imaging
            </TabsTrigger>
            <TabsTrigger value="nmr">
              <ChartNoAxesCombined />
              NMR spectroscopy
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="header-actions">
          <button
            className="btn ghost icon"
            title="Help and data sources"
            aria-label="Help and data sources"
            onClick={() => setHelp(true)}
          >
            <CircleHelp />
          </button>
          <button
            className="btn primary"
            aria-label="Import scans"
            onClick={() =>
              setImportTick((v) => ({
                ...v,
                [mode]: v[mode as "mri" | "nmr"] + 1,
              }))
            }
          >
            <Upload />
            <span className="text">Import scans</span>
          </button>
        </div>
      </header>
      <div className="mobile-bar">
        <button
          className="btn mobile-toggle"
          onClick={() => setPanel(panel === "layers" ? "" : "layers")}
        >
          <Layers />
          Layers
        </button>
        <button
          className="btn mobile-toggle"
          onClick={() => setPanel(panel === "controls" ? "" : "controls")}
        >
          <SlidersHorizontal />
          Controls
        </button>
      </div>
      <div style={{ display: mode === "mri" ? "contents" : "none" }}>
        <MRIWorkspace
          panel={panel}
          onClosePanel={() => setPanel("")}
          importTick={importTick.mri}
          active={mode === "mri"}
        />
      </div>
      <div style={{ display: mode === "nmr" ? "contents" : "none" }}>
        <SpectraWorkspace
          panel={panel}
          onClosePanel={() => setPanel("")}
          importTick={importTick.nmr}
          active={mode === "nmr"}
        />
      </div>
      <footer className="statusbar">
        <span>
          <LockKeyhole />
          Files stay in this browser
        </span>
        <span className="secondary-status">NMRView / Research & education</span>
        <span>
          <ShieldCheck />
          <span className="desktop-status">
            Not validated for clinical diagnosis
          </span>
          <span className="mobile-toggle">Research use</span>
        </span>
      </footer>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Working with NMRView</DialogTitle>
          <DialogDescription>
            MRI imaging and NMR spectroscopy are independent workspaces.
          </DialogDescription>
          <div className="dialog-body">
            <h3>MRI imaging</h3>
            <p>
              Open NIfTI (.nii, .nii.gz), NRRD, or a series of DICOM files. All
              parsing and rendering happens locally in your browser. Scans are
              overlaid using their physical coordinate transforms; they must
              already be registered to the same anatomy. NMRView does not
              perform automatic registration.
            </p>
            <h3>NMR spectroscopy</h3>
            <p>
              Import processed 1D JCAMP-DX spectra or two-column CSV files
              (chemical shift in ppm, intensity). Compare spectra as overlays or
              stacked traces. Peak picking and numerical integration operate on
              the selected spectrum.
            </p>
            <h3>Free sample data</h3>
            <p>
              MRI:{" "}
              <a
                href="https://www.bic.mni.mcgill.ca/ServicesAtlases/ICBM152NLin2009"
                target="_blank"
                rel="noreferrer"
              >
                MNI ICBM152 template
              </a>
              , Fonov et al., supplied through{" "}
              <a
                href="https://github.com/niivue/niivue-demo-images"
                target="_blank"
                rel="noreferrer"
              >
                NiiVue
              </a>
              . Freely usable with the original copyright notice; see{" "}
              <a href="/data/ATTRIBUTION.txt" target="_blank">
                data attribution
              </a>
              .
            </p>
            <p>
              NMR: Damien Jeannerat,{" "}
              <a
                href="https://doi.org/10.5281/zenodo.4616665"
                target="_blank"
                rel="noreferrer"
              >
                NMR spectra (2021)
              </a>
              , CC BY 4.0. Original experimental JCAMP files.
            </p>
            <h3>Privacy and intended use</h3>
            <p>
              Imported scans are not uploaded. Exported sessions can contain
              scan data and metadata; store them appropriately. This application
              is for research and education and has not been validated for
              clinical diagnosis. Browser memory and GPU capabilities limit
              study size, especially on mobile.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <Toaster theme="dark" position="bottom-right" />
    </main>
  );
}
