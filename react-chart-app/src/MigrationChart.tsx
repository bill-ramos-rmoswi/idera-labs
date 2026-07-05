import type { ComponentType } from "react";
import * as ReactFCModule from "react-fusioncharts";

type ReactFCClass = { fcRoot: (...modules: unknown[]) => void };

// react-fusioncharts' CJS build double-wraps its default export under Vite's
// dep pre-bundling (module.exports.default.default is the real class), and
// its .d.ts incorrectly types the export as abstract, so we unwrap and cast.
function unwrapReactFC(mod: unknown): ReactFCClass {
  let current = mod as { default?: unknown; fcRoot?: unknown };
  while (typeof current.fcRoot !== "function" && current.default) {
    current = current.default as { default?: unknown; fcRoot?: unknown };
  }
  return current as unknown as ReactFCClass;
}

// FusionCharts itself is loaded via <script> tags in index.html (see that
// file) rather than as an npm/ESM import: the fusioncharts npm package is
// built by webpack for webpack's own chunk-loading protocol and does not
// interop reliably with Vite's bundler. react-fusioncharts falls back to
// window.FusionCharts automatically when no fcLibrary prop is supplied.
const ReactFC = unwrapReactFC(ReactFCModule);
const Chart = ReactFC as unknown as ComponentType<Record<string, unknown>>;

interface MigrationData {
  label: string;
  value: number;
  toolTipText?: string;
}

const migrationStages: MigrationData[] = [
  { label: "Assessment", value: 32, toolTipText: "32 assessments completed" },
  { label: "Schema Conv.", value: 28 },
  { label: "Data Migration", value: 19 },
  { label: "Testing", value: 14 },
  { label: "Cutover", value: 7 },
];

const chartConfigs = {
  type: "column2d",
  width: "700",
  height: "400",
  dataFormat: "json",
  dataSource: {
    chart: {
      caption: "Migration Pipeline Stages",
      xAxisName: "Stage",
      yAxisName: "Count",
      theme: "fusion",
    },
    data: migrationStages,
  },
};

function MigrationChart() {
  return <Chart {...chartConfigs} />;
}

export default MigrationChart;
