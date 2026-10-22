const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const README_PATH = path.join(ROOT_DIR, 'README.md');
const CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');

function parseSemver(v) {
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

function bumpVersion(current, bumpType) {
  const parsed = parseSemver(current);
  if (!parsed) {
    throw new Error(`Invalid current semver: "${current}"`);
  }
  if (bumpType === 'major') {
    return `${parsed.major + 1}.0.0`;
  }
  if (bumpType === 'minor') {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  if (bumpType === 'patch') {
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }
  // Explicit version provided (e.g. "0.95.1")
  if (/^\d+\.\d+\.\d+$/.test(bumpType)) {
    return bumpType;
  }
  throw new Error(`Unknown bump type or invalid version: "${bumpType}". Use "patch", "minor", "major", or explicit "X.Y.Z".`);
}

function syncVersion() {
  const arg = process.argv[2]?.trim().toLowerCase();

  if (!fs.existsSync(PACKAGE_JSON_PATH)) {
    console.error('Error: package.json not found at', PACKAGE_JSON_PATH);
    process.exit(1);
  }

  const pkgRaw = fs.readFileSync(PACKAGE_JSON_PATH, 'utf8');
  const pkg = JSON.parse(pkgRaw);
  const currentVersion = pkg.version;

  let targetVersion = currentVersion;
  if (arg) {
    targetVersion = bumpVersion(currentVersion, arg);
    console.log(`Bumping version from ${currentVersion} -> ${targetVersion}`);
  } else {
    console.log(`Syncing all project files to current package.json version: ${targetVersion}`);
  }

  const changes = [];

  // 1. Synchronize package.json
  pkg.version = targetVersion;
  if (pkg.scripts && pkg.scripts['publish:openvsx']) {
    const oldPublish = pkg.scripts['publish:openvsx'];
    const newPublish = `npx -y ovsx publish antidraw-${targetVersion}.vsix`;
    if (oldPublish !== newPublish) {
      pkg.scripts['publish:openvsx'] = newPublish;
      changes.push(`package.json: updated publish:openvsx -> "${newPublish}"`);
    }
  }
  const updatedPkgRaw = JSON.stringify(pkg, null, 2) + '\n';
  if (pkgRaw !== updatedPkgRaw) {
    fs.writeFileSync(PACKAGE_JSON_PATH, updatedPkgRaw, 'utf8');
    changes.push(`package.json: version -> "${targetVersion}"`);
  }

  // 2. Synchronize README files (English, Spanish, Chinese, German, French, Russian, Japanese)
  const readmeFiles = [
    { name: 'README.md', path: README_PATH },
    { name: 'README.es.md', path: path.join(ROOT_DIR, 'README.es.md') },
    { name: 'README.zh-CN.md', path: path.join(ROOT_DIR, 'README.zh-CN.md') },
    { name: 'README.de.md', path: path.join(ROOT_DIR, 'README.de.md') },
    { name: 'README.fr.md', path: path.join(ROOT_DIR, 'README.fr.md') },
    { name: 'README.ru.md', path: path.join(ROOT_DIR, 'README.ru.md') },
    { name: 'README.ja.md', path: path.join(ROOT_DIR, 'README.ja.md') },
  ];

  for (const { name, path: filePath } of readmeFiles) {
    if (fs.existsSync(filePath)) {
      let readme = fs.readFileSync(filePath, 'utf8');
      const origReadme = readme;

      // 2.1 Badge: https://img.shields.io/badge/Status-Beta%20v...
      const badgeRegex = /https:\/\/img\.shields\.io\/badge\/Status-Beta%20v[0-9.]+-orange\?style=flat-square/g;
      const newBadgeUrl = `https://img.shields.io/badge/Status-Beta%20v${targetVersion}-orange?style=flat-square`;
      if (badgeRegex.test(readme)) {
        readme = readme.replace(badgeRegex, newBadgeUrl);
      }

      // 2.2 Status blocks across languages
      readme = readme.replace(/> \*\*Project Status: Public Beta \(v[0-9.]+\)\*\*/g, `> **Project Status: Public Beta (v${targetVersion})**`);
      readme = readme.replace(/> \*\*Estado del Proyecto: Beta Pública \(v[0-9.]+\)\*\*/g, `> **Estado del Proyecto: Beta Pública (v${targetVersion})**`);
      readme = readme.replace(/> \*\*项目状态：公开公测版 \(Public Beta v[0-9.]+\)\*\*/g, `> **项目状态：公开公测版 (Public Beta v${targetVersion})**`);
      readme = readme.replace(/> \*\*Projektstatus: Öffentliche Beta \(v[0-9.]+\)\*\*/g, `> **Projektstatus: Öffentliche Beta (v${targetVersion})**`);
      readme = readme.replace(/> \*\*État du projet : Bêta publique \(v[0-9.]+\)\*\*/g, `> **État du projet : Bêta publique (v${targetVersion})**`);
      readme = readme.replace(/> \*\*Статус проекта: Публичная бета \(v[0-9.]+\)\*\*/g, `> **Статус проекта: Публичная бета (v${targetVersion})**`);
      readme = readme.replace(/> \*\*プロジェクトステータス: パブリックベータ \(v[0-9.]+\)\*\*/g, `> **プロジェクトステータス: パブリックベータ (v${targetVersion})**`);

      if (readme !== origReadme) {
        fs.writeFileSync(filePath, readme, 'utf8');
        changes.push(`${name}: synchronized status and badges to v${targetVersion}`);
      }
    }
  }

  // 3. Verify CHANGELOG.md
  if (fs.existsSync(CHANGELOG_PATH)) {
    const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
    const headerRegex = new RegExp(`##\\s*\\[${targetVersion.replace(/\./g, '\\.')}\\]`);
    if (headerRegex.test(changelog)) {
      console.log(`✅ CHANGELOG.md already contains header for [${targetVersion}]`);
    } else {
      console.warn(`⚠️ WARNING: CHANGELOG.md does not yet contain a release header for [${targetVersion}]. Remember to add it in English!`);
    }
  }

  console.log('\n--- Version Sync Summary ---');
  if (changes.length === 0) {
    console.log(`All files are already synchronized with version ${targetVersion}. No changes needed.`);
  } else {
    changes.forEach((c) => console.log(`  ✓ ${c}`));
    console.log(`\nSuccessfully synchronized version ${targetVersion} across AntiDraw project files.`);
  }
}

syncVersion();
