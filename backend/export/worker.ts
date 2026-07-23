import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const redisConnection = new IORedis();
const exportDir = path.join(__dirname, '..', 'exports');

if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

const exportWorker = new Worker('export-jobs', async job => {
  console.log(`Processing export job ${job.id} of type ${job.name}`);
  const { documentId, format, resolution, composedSVG, width, height } = job.data;
  
  if (!composedSVG) {
    throw new Error("Missing composedSVG payload");
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    const finalWidth = width * resolution;
    const finalHeight = height * resolution;
    
    await page.setViewport({ width: finalWidth, height: finalHeight });
    
    // Inject SVG directly into the page
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
            svg { width: 100vw; height: 100vh; }
          </style>
        </head>
        <body>
          ${composedSVG}
        </body>
      </html>
    `;
    
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    const outputPath = path.join(exportDir, `${documentId}.${format}`);
    
    if (format === 'pdf') {
      await page.pdf({ path: outputPath, width: finalWidth, height: finalHeight, printBackground: true });
    } else {
      await page.screenshot({ 
        path: outputPath, 
        type: format === 'jpeg' ? 'jpeg' : 'png', 
        fullPage: true, 
        omitBackground: true 
      });
    }
    
    console.log(`Completed export job ${job.id} -> ${outputPath}`);
    // In a real app, you would upload to S3 here and return that URL
    return { url: `/exports/${documentId}.${format}` };
    
  } finally {
    await browser.close();
  }
}, { connection: redisConnection });

exportWorker.on('completed', (job, returnvalue) => {
  console.log(`Job ${job.id} completed! Output: ${returnvalue.url}`);
});

exportWorker.on('failed', (job, err) => {
  console.log(`Job ${job?.id} failed with ${err.message}`);
});

console.log('Export Background Worker started');
