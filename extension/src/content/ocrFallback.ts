import { createWorker } from 'tesseract.js';

export interface OCRResult {
  text: string;
  confidence: number;
}

let workerPromise: ReturnType<typeof createWorker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker({
      logger: () => {
        // Suppress noisy logs in production.
      }
    });
    await workerPromise.load();
    await workerPromise.loadLanguage('eng');
    await workerPromise.initialize('eng');
  }
  return workerPromise;
}

export async function runOcr(canvas: HTMLCanvasElement): Promise<OCRResult> {
  const worker = await getWorker();
  const {
    data: { text, confidence }
  } = await worker.recognize(canvas);
  return {
    text: text.trim(),
    confidence
  };
}

export async function terminateOcr() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
