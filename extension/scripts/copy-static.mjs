import { cp, mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

async function copyManifest() {
  const source = join(root, 'manifest.json');
  const target = join(dist, 'manifest.json');
  const buffer = await readFile(source);
  await ensureDir(dist);
  await writeFile(target, buffer);
}

async function copyPublic() {
  const source = join(root, 'public');
  try {
    await cp(source, dist, { recursive: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function copyImg() {
  const source = join(root, 'img');
  const target = join(dist, 'img');
  try {
    await ensureDir(target);
    await cp(source, target, { recursive: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

await ensureDir(dist);
await Promise.all([copyManifest(), copyPublic(), copyImg()]);
