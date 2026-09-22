"use client";
import { resetSession } from "@/lib/session-reset";
import { readStoredKey, storeKey } from "@/lib/assistant/key";
import { useState } from "react";
import { Assistant } from "@/components/workstation/assistant";
import {
  Activity,
  RotateCcw,
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
import SpectraWorkspace from "@/components/workstation/spectroscopy-workbench";
import { useWorkspaceTools } from "@/components/workstation/webmcp";
import { Toaster } from "@/components/ui/sonner";
export default function Home() {
  const [resetOpen, setResetOpen] = useState(false);
  // Restored from localStorage; nothing rendered at mount depends on it, so
  // the server and first client render still agree.
  const [assistantKey, setAssistantKey] = useState(() => readStoredKey());
  const [keyStorageFailed, setKeyStorageFailed] = useState(false);
  function updateAssistantKey(value: string) {
    setAssistantKey(value);
    setKeyStorageFailed(!storeKey(value));
  }
  const [assistantOpen, setAssistantOpen] = useState(false);
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
          <span className="brand-label">
            <span>
              NMR<span style={{ color: "#75deca" }}>View</span>
            </span>
          </span>
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
            className="btn icon"
            aria-label="Reset session"
            title="Reset session"
            onClick={() => setResetOpen(true)}
          >
            <RotateCcw />
          </button>
          <button
            className="btn"
            aria-expanded={assistantOpen}
            onClick={() => setAssistantOpen(!assistantOpen)}
          >
            AI assistant
          </button>
          <button
            className="btn icon"
            aria-label="Layers"
            title="Layers"
            onClick={() => setPanel(panel === "layers" ? "" : "layers")}
          >
            <Layers />
          </button>
          <button
            className="btn icon"
            aria-label="Controls"
            title="Controls"
            onClick={() => setPanel(panel === "controls" ? "" : "controls")}
          >
            <SlidersHorizontal />
          </button>

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

      <div className="workspace-body">
        <div className="image-workspaces">
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
        </div>
        {assistantOpen && (
          <Assistant
            apiKey={assistantKey}
            onApiKeyChange={updateAssistantKey}
            keyStorageFailed={keyStorageFailed}
            mode={mode}
            onClose={() => setAssistantOpen(false)}
          />
        )}
      </div>
      <footer className="statusbar">
        <span>
          <LockKeyhole />
          AI images shared only by choice
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
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Reset session?</DialogTitle>
          <DialogDescription>
            Clear all loaded MRI scans, spectra, comparison views, unsaved
            annotations and the AI conversation. The app will restart with empty
            workspaces and release its scan memory. Your saved OpenRouter API
            key stays in this browser until you use Forget key.
          </DialogDescription>
          <p>Saved collections, saved annotations and exported files remain available.
            Save any work you want to keep before resetting.</p>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={() => setResetOpen(false)}>Cancel</button>
            <button className="btn primary" onClick={resetSession}>Reset session</button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Working with NMRView</DialogTitle>
          <DialogDescription>
            MRI imaging and NMR spectroscopy are independent workspaces.
          </DialogDescription>
          <div className="dialog-body">
            <h3>Why NMRView?</h3>
            <p>
              NMRView takes its name from nuclear magnetic resonance, the
              physics behind magnetic resonance imaging (MRI). Use the MRI
              workspace to view scans and the NMR spectroscopy workspace to
              explore spectra.
            </p>
            <h3>MRI imaging</h3>
            <p>
              The viewer starts empty and shows only the scans you load. Open
              NIfTI (.nii, .nii.gz), NRRD, or a series of DICOM files, or
              browse a public repository. All parsing and rendering happens
              locally in your browser. Scans are
              overlaid using their physical coordinate transforms; they must
              already be registered to the same anatomy. NMRView does not
              perform automatic registration.
            </p>
            <h3>NMR spectroscopy</h3>
            <p>
              Choose Laboratory NMR for 1D spectra and quality review, 2D NMR for processed spectral maps, or Tissue MRS for online NIfTI-MRS acquisitions, anatomical localization and acquisition-matched basis analysis. Processing stays in the browser.
            </p>
            <h3>Free sample data</h3>
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
              Full scans stay in this browser. The AI assistant can send a
              viewport image to OpenRouter only when you attach it and confirm
              sharing. Exported sessions can contain scan data and metadata;
              store them appropriately. This application is for research and
              education and has not been validated for clinical diagnosis.
              Browser memory and GPU capabilities limit study size, especially
              on mobile.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <Toaster theme="dark" position="bottom-right" />
    </main>
  );
}
