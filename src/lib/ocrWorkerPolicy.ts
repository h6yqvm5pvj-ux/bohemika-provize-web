// A dedicated worker needs WebAssembly and same-origin engine/language files.
// This policy does not allow JavaScript eval or relax document-page CSP.
export const OCR_WORKER_CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'";
