# FusionCharts npm Package: Vite / Modern Bundler Compatibility Issue

## Summary

The `fusioncharts` npm package (v4.2.2) and its React wrapper
`react-fusioncharts` (v4.2.0) do not work reliably when consumed as ES
modules through [Vite](https://vite.dev/), a widely-used modern frontend
build tool. Three distinct, unrelated failures occurred while trying every
documented/reasonable import path. The working fix was to abandon npm/ESM
imports for the FusionCharts library entirely and load it via a classic
global `<script>` tag instead — which defeats the purpose of using a modern
bundler-based workflow.

## Why Vite matters

Vite is one of the most widely adopted frontend build tools today, used as
the default toolchain for new React, Vue, and Svelte projects (including
Vite-based scaffolding in Create React App's community-recommended
successor tooling). Teams building modern component-based frontends
increasingly expect to `npm install` a charting library and `import` it
directly into a component — the same workflow that already works for
libraries like Chart.js, Recharts, Nivo, and ECharts. A charting vendor that
requires falling back to `<script>` tags loses adoption from teams
standardized on Vite (or any esbuild/rolldown-based bundler), and forces an
awkward hybrid architecture (bundled app code + globally-loaded third-party
script).

## Environment

- `fusioncharts`: 4.2.2
- `react-fusioncharts`: 4.2.0
- `vite`: 8.1.x (using the default `@vitejs/plugin-react`, esbuild/rolldown
  dependency pre-bundling)
- `react` / `react-dom`: 19.2.x
- TypeScript: 6.0.x, `moduleResolution: "bundler"`

## What we tried, and what broke

### 1. Standard import, per FusionCharts' own React documentation

```ts
import ReactFC from "react-fusioncharts";
import FusionCharts from "fusioncharts";
import Charts from "fusioncharts/fusioncharts.charts";
import FusionTheme from "fusioncharts/themes/fusioncharts.theme.fusion";

ReactFC.fcRoot(FusionCharts, Charts, FusionTheme);
```

**Result:** `Uncaught TypeError: ReactFC.fcRoot is not a function`

**Root cause:** `react-fusioncharts`'s CJS build (`lib/ReactFC.js`) exports
the `ReactFC` class via `exports.default = ReactFC`. When Vite's dependency
pre-bundler (esbuild/rolldown) converts this CJS module for ESM consumption,
the interop wraps the module twice — `import * as ReactFCModule` resolves to
an object whose `.default` is *itself* an object with another `.default`,
two levels deep, before reaching the actual class. A plain
`import ReactFC from "react-fusioncharts"` only unwraps one level, so
`ReactFC.fcRoot` is `undefined`.

**Workaround applied:** manually unwrap `.default` in a loop until a value
with a `.fcRoot` function is found.

### 2. Chart-type registration via `fusioncharts/fusioncharts.charts`

Even after fixing (1), the chart component mounted (a correctly-sized
container `<span>` appeared in the DOM) but no chart was ever drawn — no
SVG content, no error.

**Root cause:** `fusioncharts/fusioncharts.charts.js` is a webpack
chunk-loader file. Its UMD wrapper is:

```js
!function(e){"object"==typeof module && module.exports!==undefined ? module.exports=e : e()}(function(){
  (self.webpackChunkFusionCharts = self.webpackChunkFusionCharts || []).push([[2], {...}]);
});
```

When required as a plain CJS/ESM module outside of a webpack build,
`module.exports` is set to the **raw factory function itself**, not its
return value — and even when invoked, the factory just pushes an entry onto
`self.webpackChunkFusionCharts`, a webpack-runtime-specific chunk registry
that has no meaning inside Vite/esbuild's own module graph. Passing this to
`ReactFC.fcRoot(...)` silently does nothing useful.

We also checked the scoped `@fusioncharts/charts` package (listed as a
dependency of the main `fusioncharts` package) as an alternative import
target — it has no built entry file (`main: "index.js"` but no `index.js`
present in the published package), so it isn't usable directly either.

### 3. FusionCharts' actual ESM build (`fusioncharts/es`)

The `fusioncharts` package does ship a real ESM entry point at
`fusioncharts/es/index.js` (not referenced by `package.json`'s `main` or a
`module`/`exports` field, so it must be imported by explicit deep path). This
build is architected for on-demand loading: it listens for a
`resourceRequested` event and dynamically `import()`s the chart-type module
needed (`"../charts"`, `"../powercharts"`, `"../gantt"`, etc.), using
`/* webpackChunkName: ... */` magic comments intended for webpack's code
splitting.

```ts
import FusionCharts from "fusioncharts/es";
```

**Result:** Vite/rolldown *did* successfully code-split all of FusionCharts'
individual chart-type modules into separate chunks (confirmed via build
output — 50+ separate chunk files: `column-*.js`, `mscartesian-*.js`,
`pie2d-*.js`, `treemap-*.js`, etc.). However, at runtime, the chart got stuck
showing FusionCharts' own "Loading chart. Please wait." placeholder
indefinitely, and ultimately:

```
Uncaught (in promise) Error: TypeError: p is not a constructor
```

**Root cause (inferred):** FusionCharts' internal dynamic-import handling
code expects the shape of the resolved module (`{ default: ... }` vs. a bare
export, or a specific constructor pattern) to match what webpack's
`import()` transform produces. Vite/rolldown's dynamic `import()` resolves
to a differently-shaped module namespace object, and FusionCharts' internal
code tries to construct something from it that isn't a constructor.

## Working fix (used in this project)

Load FusionCharts core and theme via classic `<script>` tags in `index.html`
(from the FusionCharts CDN), and do **not** import `fusioncharts` via
npm/ESM at all:

```html
<script src="https://cdn.fusioncharts.com/fusioncharts/latest/fusioncharts.js"></script>
<script src="https://cdn.fusioncharts.com/fusioncharts/latest/themes/fusioncharts.theme.fusion.js"></script>
```

`react-fusioncharts`'s `<ReactFC>` component already has a documented
fallback for this case — it uses `window.FusionCharts` automatically when no
`fcLibrary` prop is passed (`ReactFC.js`: `this.FusionCharts = props.fcLibrary
|| ReactFC.fusionChartsCore || window.FusionCharts`). We still had to keep
the `.default`-unwrapping workaround from issue (1) for the
`react-fusioncharts` import itself, since that package is separate from
`fusioncharts` and has the same double-wrap problem.

This works, but it means:
- The chart library is not bundled, versioned, or tree-shaken with the rest
  of the app.
- It requires either a runtime network dependency on the FusionCharts CDN,
  or manually copying `fusioncharts.js` + theme files into a `public/`
  folder to self-host.
- Chart-type code splitting (a key benefit of the real ESM build in issue 3)
  is lost — the full `fusioncharts.js` bundle loads unconditionally.

## Recommendation to the FusionCharts product team

1. **Publish a bundler-agnostic ESM build** that does not rely on
   webpack-specific `webpackChunkName` magic comments or webpack's chunk
   registry (`self.webpackChunkFusionCharts`). Standard dynamic `import()`
   expressions without webpack-specific magic comments work correctly across
   Vite, esbuild, rollup, and webpack alike.
2. **Fix the double-`default`-wrapping** in `react-fusioncharts`'s CJS
   build, or ship a proper ESM build for that package too — this alone broke
   the simplest possible usage (`ReactFC.fcRoot is not a function`) before
   any chart-specific code was even involved.
3. **Add a `package.json` `exports` field** (and/or `module` field) to both
   `fusioncharts` and `react-fusioncharts` so bundlers resolve the correct
   ESM entry automatically, instead of requiring consumers to guess and
   import deep, undocumented paths like `fusioncharts/es`.
4. **Fix or correct the shipped TypeScript declarations.**
   `react-fusioncharts`'s `.d.ts` declares its default export as an
   `abstract class`, which TypeScript rejects as a JSX component
   (`TS2786: 'ReactFC' cannot be used as a JSX component`) even though the
   runtime value is a concrete, instantiable class.
5. Short of a full fix, **publish an official, tested example/template for
   Vite** (as already exists for Create React App / webpack elsewhere in
   FusionCharts' docs) so teams don't have to reverse-engineer the working
   `<script>`-tag fallback themselves.

## Appendix: Files involved

- `MigrationChart.tsx` — final working component (script-tag approach)
- `index.html` — FusionCharts core + theme loaded via `<script>`
- `README.md` — project documentation covering the working setup
