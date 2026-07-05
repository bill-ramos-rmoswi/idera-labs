# react-chart-app

A React + TypeScript + Vite app that renders a FusionCharts chart from typed data.

## Project Structure

```
react-chart-app/
├── index.html              # Entry HTML — loads FusionCharts core + theme via <script> tags
├── src/
│   ├── main.tsx             # React root, mounts <App />
│   ├── App.tsx              # Top-level component, renders <MigrationChart />
│   ├── MigrationChart.tsx   # Typed data + FusionCharts column2d chart component
│   ├── App.css / index.css  # Styles
│   └── assets/               # Static assets (logos, etc.)
├── public/                  # Static files served as-is (favicon, icons)
├── vite.config.ts           # Vite + @vitejs/plugin-react config
├── tsconfig*.json           # TypeScript project references (app/node splits)
└── package.json
```

## Architecture / Design

The chart data is typed in `MigrationChart.tsx`:

```ts
interface MigrationData {
  label: string;
  value: number;
  toolTipText?: string;
}
```

An array of `MigrationData` is passed straight into FusionCharts' `dataSource.data`
for a `column2d` chart, rendered through the `react-fusioncharts` `<ReactFC>`
component.

### Why FusionCharts is loaded via `<script>` tags, not npm/ESM import

FusionCharts' npm package (`fusioncharts`) is built by webpack for webpack's
own chunk-loading protocol (`webpackChunkName` magic comments, dynamic
`import()` of chart-type modules). It does not interop reliably with Vite's
bundler — three different breakages were hit trying to import it as an ES
module:

1. `react-fusioncharts`'s CJS default export gets double-wrapped by Vite's
   dependency pre-bundling.
2. `fusioncharts/fusioncharts.charts.js` is a webpack chunk-loader file, not a
   plain importable module.
3. FusionCharts' real ESM entry (`fusioncharts/es`) dynamically `import()`s
   chart-type chunks at runtime, which throws inside its own loading logic
   when bundled by Vite.

The working, low-friction fix: load `fusioncharts.js` and the fusion theme as
classic global `<script>` tags in `index.html` (see that file), the same way
the plain HTML/JS FusionCharts demos in the parent `idera-labs` folder do.
`react-fusioncharts`'s `<ReactFC>` component automatically falls back to
`window.FusionCharts` when no `fcLibrary` prop is supplied, so no npm import
of `fusioncharts` is needed in application code.

`MigrationChart.tsx` still imports `react-fusioncharts` itself (for the React
component wrapper) and unwraps its double-nested default export
(`unwrapReactFC`) to work around the Vite interop issue in point 1 above.

**Trade-off:** this means the chart library loads from the FusionCharts CDN
at runtime and requires network access. To self-host instead, copy
`fusioncharts.js` and the theme file into `public/` and point the
`<script src="...">` tags in `index.html` at the local paths.

## Build Instructions

```bash
npm install        # install dependencies
npm run build      # type-check (tsc -b) + production build to dist/
```

## How to Test / Run

```bash
npm run dev        # start Vite dev server with hot module reload
```

Open the printed URL (e.g. `http://localhost:5183`) in a browser. You should
see a "Migration Pipeline Stages" column chart with five bars: Assessment,
Schema Conv., Data Migration, Testing, Cutover.

Editing `MigrationChart.tsx` (data values, chart `type`, etc.) hot-reloads
automatically — no restart needed.

To check the production build instead of the dev server:

```bash
npm run build
npm run preview    # serves dist/ locally
```

There is no automated test suite in this project; verification is manual —
run one of the commands above and confirm the chart renders with no errors
in the browser console (F12 → Console).

## Shutting Down the Server

If you started `npm run dev` or `npm run preview` in a terminal you still
have open, just switch to that terminal and press `Ctrl+C`.

If the terminal was closed and the server is still running in the
background, find and stop it by port. In PowerShell:

```powershell
# Find the process listening on the dev server's port (e.g. 5183)
netstat -ano | findstr :5183

# The last column is the PID — stop it
Stop-Process -Id <PID> -Force
```

In a bash shell (Git Bash/WSL):

```bash
netstat -ano | grep 5183
taskkill //F //PID <PID>
```

Vite dev/preview servers pick the next free port (5174, 5175, ...) if the
default is already taken, so check `netstat` output for whichever port
you saw printed when the server started if you're unsure.
