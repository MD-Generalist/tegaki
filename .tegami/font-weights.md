---
packages:
  tegaki: minor
---

## Bundles with several font weights

A bundle can now hold several weights of its font. `weight` states the weight of the bundle's own face (400 when absent), and `faces` lists the others, each with its own font files and glyph data. The renderer reads the text's computed `font-weight` and draws the face CSS font matching picks, the same face the browser lays the text out in. A `font-weight` set anywhere above the renderer, including one that changes later through a class or a media query, switches the strokes to that weight's face. Each face's font is loaded only once a weight picks it.

```ts
const bundle = createBundle({
  family: 'Caveat',
  fontUrl: '.../caveat.ttf',
  glyphData,
  faces: [{ weight: 700, fontUrl: '.../caveat-700.ttf', glyphData: boldGlyphData }],
});
```

`bundleForWeight(bundle, weight)` returns the bundle as one weight draws it, and `bundleWeights(bundle)` lists the weights it has. `textToSvg` takes a `fontWeight` option.

Bundles without `faces` render as before, and the bundle format version stays 1. One change applies to every bundle: the renderer's root now sets `font-synthesis-weight: none`. The browser no longer fakes a bold from a lighter face, because the strokes would not follow it. A `font-weight: bold` above a single-weight bundle now leaves its text layer and its fallback characters in the bundle's weight.
