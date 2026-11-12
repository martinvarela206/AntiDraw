/**
 * ARCHITECTURAL RATIONALE: Deterministic VS Code Runtime Target Resolver
 *
 * 1. Single Source of Truth:
 *    Derives esbuild compilation targets directly from `package.json` -> `engines.vscode`,
 *    preventing modern ECMAScript syntax (such as Object.groupBy, decorators, or RegExp v-flags)
 *    from being emitted that cannot be executed by the target Electron/Node.js/Chromium runtime.
 *
 * 2. Extension Host & Webview Runtime Alignment:
 *    - Extension Host runs in Node.js within the main Electron host process.
 *    - Webviews execute inside Electron's embedded Chromium browser sandbox.
 *    Mapping both targets ensures zero syntax incompatibilities across the full engine range.
 */

const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} VsCodeTargetResolution
 * @property {string} rawEngineString
 * @property {string} minVsCodeVersion
 * @property {number} major
 * @property {number} minor
 * @property {number} electronVersion
 * @property {string} nodeTarget
 * @property {string} chromeTarget
 */

/**
 * Known VS Code -> Electron -> Node / Chromium runtime table.
 * Source: https://code.visualstudio.com/updates & Electron Releases
 */
const VSCODE_RUNTIME_MILESTONES = [
  { minMinor: 95, electron: 32, node: 'node20', chrome: 'chrome128' },
  { minMinor: 93, electron: 30, node: 'node20', chrome: 'chrome124' },
  { minMinor: 90, electron: 29, node: 'node20', chrome: 'chrome122' },
  { minMinor: 87, electron: 27, node: 'node18', chrome: 'chrome118' },
  { minMinor: 82, electron: 25, node: 'node18', chrome: 'chrome114' },
  { minMinor: 80, electron: 22, node: 'node16', chrome: 'chrome108' },
  { minMinor: 75, electron: 19, node: 'node16', chrome: 'chrome102' },
];

function parseMinVersion(engineString) {
  const match = engineString.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) {
    return { major: 1, minor: 80, patch: 0, versionStr: '1.80.0' };
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3] || '0', 10),
    versionStr: `${match[1]}.${match[2]}.${match[3] || '0'}`,
  };
}

function resolveVsCodeTargets(customPackageJsonPath) {
  let pkgPath = customPackageJsonPath;
  if (!pkgPath) {
    const candidateLocal = path.join(__dirname, '..', 'package.json');
    const candidateCwd = path.join(process.cwd(), 'package.json');
    pkgPath = fs.existsSync(candidateLocal) ? candidateLocal : candidateCwd;
  }
  let rawEngineString = '^1.80.0';

  try {
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.engines && pkg.engines.vscode) {
        rawEngineString = pkg.engines.vscode;
      }
    }
  } catch (err) {
    console.warn('[VsCodeTargetResolver] Failed to read package.json, falling back to ^1.80.0', err);
  }

  return resolveTargetsFromEngineString(rawEngineString);
}

function resolveTargetsFromEngineString(engineString) {
  const parsed = parseMinVersion(engineString);
  let matched = VSCODE_RUNTIME_MILESTONES[VSCODE_RUNTIME_MILESTONES.length - 1];

  for (const milestone of VSCODE_RUNTIME_MILESTONES) {
    if (parsed.major > 1 || (parsed.major === 1 && parsed.minor >= milestone.minMinor)) {
      matched = milestone;
      break;
    }
  }

  return {
    rawEngineString: engineString,
    minVsCodeVersion: parsed.versionStr,
    major: parsed.major,
    minor: parsed.minor,
    electronVersion: matched.electron,
    nodeTarget: matched.node,
    chromeTarget: matched.chrome,
  };
}

module.exports = {
  resolveVsCodeTargets,
  resolveTargetsFromEngineString,
  VSCODE_RUNTIME_MILESTONES,
};
