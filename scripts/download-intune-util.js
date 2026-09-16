import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BIN_DIR = path.join(__dirname, '../bin');
const FILE_PATH = path.join(BIN_DIR, 'IntuneWinAppUtil.exe');
const URL = 'https://raw.githubusercontent.com/microsoft/Microsoft-Win32-Content-Prep-Tool/master/IntuneWinAppUtil.exe';

if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

if (!fs.existsSync(FILE_PATH)) {
  console.log('Downloading IntuneWinAppUtil.exe from Microsoft GitHub...');
  const file = fs.createWriteStream(FILE_PATH);
  
  const download = (url) => {
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        download(response.headers.location);
      } else if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('Download of IntuneWinAppUtil.exe complete.');
        });
      } else {
        console.error(`Failed to download: Server responded with ${response.statusCode}`);
        fs.unlinkSync(FILE_PATH);
      }
    }).on('error', (err) => {
      fs.unlinkSync(FILE_PATH);
      console.error('Error downloading IntuneWinAppUtil.exe:', err.message);
    });
  };
  
  download(URL);
} else {
  console.log('IntuneWinAppUtil.exe already exists, skipping download.');
}
