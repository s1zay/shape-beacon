import { ShapeEngine } from './shape-engine.js';

// Preserve the classic browser SDK API: one instance on window, not a constructor export.
if (typeof window !== 'undefined') {
    window.ShapeEngine = new ShapeEngine();
    // Do not auto-start in the demo UI.
}
