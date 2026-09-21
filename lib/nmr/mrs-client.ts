import type { Basis, fitBasis } from "./basis";
import Worker from "./mrs.worker?worker";
import type { MRSInfo, Processing } from "./mrs";
import type { Spectrum } from "./spectrum";
export type MRSMap = {
  values: number[];
  errors: number[];
  valid: boolean[];
  nx: number;
  ny: number;
  component: string;
  denominator: string;
  z: number;
};
export class MRSClient {
  private worker = new Worker();
  private id = 0;
  private closed = false;
  private pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor() {
    this.worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error));
      else p.resolve(data.result);
    };
    this.worker.onerror = () => this.dispose();
  }
  private call<T>(payload: object): Promise<T> {
    if (this.closed)
      return Promise.reject(
        new Error("MRS worker was stopped. Reload the acquisition."),
      );
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => this.dispose(), 60000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ ...payload, id });
    });
  }
  load(file: Blob, name: string, source: string, assumeUnits = false) {
    return this.call<MRSInfo>({
      kind: "load",
      file,
      name,
      source,
      assumeUnits,
    });
  }
  spectrum(selection: number[], processing: Processing) {
    return this.call<Spectrum>({ kind: "spectrum", selection, processing });
  }
  fit(
    selection: number[],
    processing: Processing,
    basis: Basis,
    range: [number, number],
  ) {
    return this.call<ReturnType<typeof fitBasis>>({
      kind: "fit",
      selection,
      processing,
      basis,
      range,
    });
  }
  map(
    selection: number[],
    processing: Processing,
    basis: Basis,
    range: [number, number],
    component: string,
    denominator: string,
  ) {
    return this.call<MRSMap>({
      kind: "map",
      selection,
      processing,
      basis,
      range,
      component,
      denominator,
    });
  }
  dispose() {
    this.closed = true;
    this.worker.terminate();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("MRS operation stopped or timed out."));
    }
    this.pending.clear();
  }
}
