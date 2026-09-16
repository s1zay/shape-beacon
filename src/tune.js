import { TUNE_VERSION } from './version.js';

export const DEFAULT_TUNE = {
  "version": TUNE_VERSION,
  "metrics": {
    "intensity": {
      "base": 0.0,
      "weights": {
        "actionDensity": 0.77,
        "burstVariance": 0.1,
        "idleFraction": 0.0,
        "pathEfficiency": 0.0,
        "velocityVolatility": 0.0,
        "directionalInflection": 0.0,
        "modalitySwitching": 0.0
      }
    },
    "rhythm": {
      "base": 1.0,
      "weights": {
        "actionDensity": 0.0,
        "burstVariance": -0.6,
        "idleFraction": 0.0,
        "pathEfficiency": 0.0,
        "velocityVolatility": -0.7,
        "directionalInflection": -0.2,
        "modalitySwitching": 0.0
      }
    },
    "exploration": {
      "base": 0.4,
      "weights": {
        "actionDensity": 0.1,
        "burstVariance": 0.0,
        "idleFraction": 0.2,
        "pathEfficiency": -0.31,
        "velocityVolatility": 0.2,
        "directionalInflection": 0.1,
        "modalitySwitching": 0.0
      }
    },
    "coherence": {
      "base": 1.0,
      "weights": {
        "actionDensity": 0.0,
        "burstVariance": 0.0,
        "idleFraction": 0.0,
        "pathEfficiency": -0.2,
        "velocityVolatility": -0.74,
        "directionalInflection": -0.83,
        "modalitySwitching": 0.0
      }
    }
  },
  "shapes": {
    "steady": [0.4, 0.8, 0.3, 0.7],
    "burst": [0.8, 0.3, 0.5, 0.6],
    "drift": [0.3, 0.4, 0.7, 0.6],
    "chaotic": [0.7, 0.3, 0.7, 0.2],
    "flat": [0.1, 0.1, 0.1, 0.6],
    "ambient": [0.5, 0.5, 0.5, 0.5]
  }
};
