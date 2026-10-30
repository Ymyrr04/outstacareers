import * as pdfjsNamespace from "pdfjs-dist";

// Some bundler/dev-server CJS interop layers expose the PDF.js library only as
// the module's default export, while proper ESM exposes named exports on the
// namespace. Normalize both shapes so `GlobalWorkerOptions` is always present.
const namespace = pdfjsNamespace as unknown as {
  GlobalWorkerOptions?: unknown;
  default?: typeof pdfjsNamespace;
};

const pdfjsLib =
  (namespace.GlobalWorkerOptions ? namespace : (namespace.default ?? namespace)) as typeof pdfjsNamespace;


// Set up the PDF.js worker once for every consumer.
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export default pdfjsLib;
