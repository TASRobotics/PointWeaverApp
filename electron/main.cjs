const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';

// Same layout pointweaver-lib reads: deploy/pointweaver/robot.json + deploy/pointweaver/paths/*.json.
// Projects from before the library still have deploy/autonomous; use that only if it's the one that exists.
const POINTWEAVER_DIR = ['src', 'main', 'deploy', 'pointweaver'];
const PATHS_DIR = [...POINTWEAVER_DIR, 'paths'];
const LEGACY_PATHS_DIR = ['src', 'main', 'deploy', 'autonomous'];
// Editor-only stuff (field image, calibration). Lives in the robot repo so the team shares it.
const SETTINGS_DIR = '.pointweaver';
const NAME_RE = /^[A-Za-z0-9_\- ]+$/;
const IMAGE_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

let mainWindow;

const pathsDir = (projectDir) => {
  const current = path.join(projectDir, ...PATHS_DIR);
  const legacy = path.join(projectDir, ...LEGACY_PATHS_DIR);
  return !fs.existsSync(current) && fs.existsSync(legacy) ? legacy : current;
};
const settingsDir = (projectDir) => path.join(projectDir, SETTINGS_DIR);

function pathFile(projectDir, name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) throw new Error(`Invalid path name: ${name}`);
  return path.join(pathsDir(projectDir), `${name}.json`);
}

const robotFile = (projectDir) => path.join(projectDir, ...POINTWEAVER_DIR, 'robot.json');

// basename() so a file name can never point outside .pointweaver
const settingsFile = (projectDir, file) => path.join(settingsDir(projectDir), path.basename(file));

/** Wrap a handler so it always resolves to { ...result } or { error } */
function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return (await fn(...args)) ?? { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });
}

/** Find TunerConstants.java anywhere under src/main/java. */
function findTunerConstants(dir, depth = 0) {
  if (depth > 12 || !fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === 'TunerConstants.java') return full;
    if (entry.isDirectory()) {
      const found = findTunerConstants(full, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;
const TO_METERS = { Meters: 1, Inches: 0.0254, Centimeters: 0.01, Feet: 0.3048 };
const TO_MPS = { MetersPerSecond: 1, FeetPerSecond: 0.3048 };

/**
 * Pull what the ghost needs out of a Tuner X generated TunerConstants.java:
 * top speed, module radius (so max spin rate) and a rough footprint.
 */
function parseTunerConstants(src) {
  const speed = /kSpeedAt12Volts\s*=\s*(MetersPerSecond|FeetPerSecond)\.of\(\s*([\d.]+)\s*\)/.exec(src);
  if (!speed) throw new Error('kSpeedAt12Volts not found in TunerConstants.java');
  const maxSpeed = parseFloat(speed[2]) * TO_MPS[speed[1]];
  const out = { maxSpeed: round(maxSpeed, 3) };

  const modules = {};
  const posRe = /k(FrontLeft|FrontRight|BackLeft|BackRight)(X|Y)Pos\s*=\s*(Meters|Inches|Centimeters|Feet)\.of\(\s*(-?[\d.]+)\s*\)/g;
  for (const m of src.matchAll(posRe)) {
    (modules[m[1]] ??= {})[m[2]] = parseFloat(m[4]) * TO_METERS[m[3]];
  }
  const xy = Object.values(modules).filter(p => p.X != null && p.Y != null);
  if (xy.length) {
    const radius = Math.max(...xy.map(p => Math.hypot(p.X, p.Y)));
    if (radius > 0) out.maxAngularRate = Math.round((maxSpeed / radius) * 180 / Math.PI);
    // module span plus a typical wheel-to-bumper allowance; edit to your real bumpers
    out.robotLength = round(2 * Math.max(...xy.map(p => Math.abs(p.X))) + 0.25, 2);
    out.robotWidth = round(2 * Math.max(...xy.map(p => Math.abs(p.Y))) + 0.25, 2);
  }
  return out;
}

function readImageAsDataUrl(file) {
  const mime = IMAGE_EXT[path.extname(file).toLowerCase()] ?? 'image/png';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

/** Remove any old field.* so only one image is kept. */
function clearFieldImages(projectDir) {
  const dir = settingsDir(projectDir);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (/^field\.[a-z]+$/i.test(f)) fs.unlinkSync(path.join(dir, f));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  handle('paths:list', (projectDir) => {
    const dir = pathsDir(projectDir);
    if (!fs.existsSync(dir)) return { paths: [], skipped: [] };
    const paths = [];
    const skipped = [];
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        if (!Array.isArray(content.points)) content.points = [];
        if (content.params === undefined) content.params = null;
        paths.push({ name: f.slice(0, -5), content });
      } catch (e) {
        skipped.push(`${f}: ${e.message}`);
      }
    }
    return { paths, skipped };
  });

  handle('paths:write', (projectDir, name, data) => {
    fs.mkdirSync(pathsDir(projectDir), { recursive: true });
    fs.writeFileSync(pathFile(projectDir, name), JSON.stringify(data, null, 2) + '\n');
  });

  handle('paths:rename', (projectDir, oldName, newName) => {
    const from = pathFile(projectDir, oldName);
    const to = pathFile(projectDir, newName);
    if (fs.existsSync(to)) throw new Error('A path with that name already exists.');
    fs.renameSync(from, to);
  });

  handle('paths:delete', (projectDir, name) => {
    const file = pathFile(projectDir, name);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });

  handle('dialog:selectDir', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return { dir: result.canceled ? null : result.filePaths[0] ?? null };
  });

  handle('robot:read', (projectDir) => {
    const file = robotFile(projectDir);
    if (!fs.existsSync(file)) return { settings: null };
    return { settings: JSON.parse(fs.readFileSync(file, 'utf-8')) };
  });

  handle('robot:write', (projectDir, settings) => {
    const file = robotFile(projectDir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\n');
  });

  handle('robot:importTuner', (projectDir) => {
    const file = findTunerConstants(path.join(projectDir, 'src', 'main', 'java'));
    if (!file) throw new Error('TunerConstants.java not found under src/main/java');
    return { settings: parseTunerConstants(fs.readFileSync(file, 'utf-8')), file: path.relative(projectDir, file) };
  });

  handle('settings:read', (projectDir) => {
    const file = settingsFile(projectDir, 'settings.json');
    if (!fs.existsSync(file)) return { settings: {} };
    return { settings: JSON.parse(fs.readFileSync(file, 'utf-8')) };
  });

  handle('settings:write', (projectDir, settings) => {
    fs.mkdirSync(settingsDir(projectDir), { recursive: true });
    fs.writeFileSync(settingsFile(projectDir, 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
  });

  // Pick an image and copy it into .pointweaver/field.<ext>
  handle('field:pick', async (projectDir) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { file: null };
    const src = result.filePaths[0];
    const file = `field${path.extname(src).toLowerCase()}`;
    fs.mkdirSync(settingsDir(projectDir), { recursive: true });
    clearFieldImages(projectDir);
    fs.copyFileSync(src, settingsFile(projectDir, file));
    return { file, dataUrl: readImageAsDataUrl(src) };
  });

  // Save a dropped image (data URL) into .pointweaver/field.<ext>
  handle('field:save', (projectDir, dataUrl) => {
    const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl);
    if (!m) throw new Error('Unsupported image');
    const file = `field.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    fs.mkdirSync(settingsDir(projectDir), { recursive: true });
    clearFieldImages(projectDir);
    fs.writeFileSync(settingsFile(projectDir, file), Buffer.from(m[2], 'base64'));
    return { file };
  });

  handle('field:read', (projectDir, file) => {
    const full = settingsFile(projectDir, file);
    if (!fs.existsSync(full)) return { dataUrl: null };
    return { dataUrl: readImageAsDataUrl(full) };
  });

  handle('field:clear', (projectDir) => {
    clearFieldImages(projectDir);
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
