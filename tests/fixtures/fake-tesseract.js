// A stand-in for tesseract.js, so tests/recipes.js can drive the whole OCR
// path — scanned PDF ▸ page pictures ▸ prepImage ▸ worker ▸ text ▸ parser —
// offline and deterministically. recipes.html loads whatever address is in
// the "Adresa motorului OCR" field, which is exactly what makes this
// possible; nothing in the app knows this file exists.
//
// It records what it was handed (canvas size, and one pixel from each half)
// so the checks can assert the preprocessing, and returns whatever text the
// test queued in window.__ocrText.
(function () {
  window.__ocrSeen = [];
  window.__ocrText = null;                  // an array of strings, shifted per page
  window.Tesseract = {
    async createWorker(langs, oem, opts) {
      const log = (opts && opts.logger) || function () {};
      log({ status: 'loading tesseract core', progress: 0.5 });
      log({ status: 'loading language traineddata', progress: 1 });
      window.__ocrWorkers = (window.__ocrWorkers || 0) + 1;
      return {
        langs: langs,
        oem: oem,
        options: opts,
        async recognize(canvas) {
          log({ status: 'recognizing text', progress: 0.5 });
          const ctx = canvas.getContext('2d');
          const at = (fx, fy) => ctx.getImageData(
            Math.round(canvas.width * fx), Math.round(canvas.height * fy), 1, 1).data[0];
          window.__ocrSeen.push({
            w: canvas.width, h: canvas.height, left: at(0.25, 0.5), right: at(0.75, 0.5)
          });
          log({ status: 'recognizing text', progress: 1 });
          const queued = window.__ocrText;
          const text = (queued && queued.length) ? queued.shift() : '';
          return { data: { text: text } };
        },
        async terminate() { window.__ocrTerminated = (window.__ocrTerminated || 0) + 1; }
      };
    }
  };
})();
