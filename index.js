const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const process = require("process");
const { exec } = require("child_process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/drive"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(__dirname, "token.json");
const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");

// Run the first command: "flutter run --release"
const flutterRunCommand = "flutter run --release";
const flutterProcess = exec(flutterRunCommand);
const apkFilePath = path.join(
  process.cwd(),
  "build/app/outputs/flutter-apk/app-release.apk"
);

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fsp.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fsp.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fsp.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the names and IDs of up to 10 files.
 * @param {OAuth2Client} authClient An authorized OAuth2 client.
 */
async function listFiles(authClient) {
  const drive = google.drive({ version: "v3", auth: authClient });
  const res = await drive.files.list({
    pageSize: 10,
    fields: "nextPageToken, files(id, name)",
  });
  const files = res.data.files;
  if (files.length === 0) {
    console.log("No files found.");
    return;
  }

  console.log("Files:");
  files.map((file) => {
    console.log(`${file.name} (${file.id})`);
  });
}

async function uploadApp(authClient) {
  console.log("Uploading APK file...");
  const drive = google.drive({ version: "v3", auth: authClient });
  const apkContent = fs.createReadStream(apkFilePath);

  const folderName = "shared-app";
  const folderId = await findOrCreateFolder(drive, folderName);

  // Check if the "androidapp.apk" file exists in the folder
  const existingFileId = await findFileInFolder(
    drive,
    folderId,
    "androidapp.apk"
  );

  const fileMetadata = {
    name: "androidapp.apk", // Change the file name as needed
    mimeType: "application/vnd.android.package-archive",
    parents: [folderId],
  };

  let res = null;

  if (existingFileId) {
    // File exists, update it
    res = await drive.files.update({
      fileId: existingFileId,
      media: {
        mimeType: "application/vnd.android.package-archive",
        body: apkContent,
      },
      fields: "id, webContentLink",
    });
    console.log("APK file updated with ID:", existingFileId);
  } else {
    // File doesn't exist, create it
    res = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: "application/vnd.android.package-archive",
        body: apkContent,
      },
      supportsAllDrives: true,
      fields: "id, webContentLink",
    });
    console.log("APK file created with ID:", res.data.id);
  }

  console.log("Web Content Link:", res.data.webContentLink);
}

async function findOrCreateFolder(drive, folderName) {
  const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({
    q: query,
    spaces: "drive",
    fields: "files(id, name)",
  });

  const folders = res.data.files;

  if (folders.length > 0) {
    // Folder exists, return its id
    return folders[0].id;
  } else {
    // Folder doesn't exist, create it and return the id
    const folderMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    };

    const folderRes = await drive.files.create({
      requestBody: folderMetadata,
      fields: "id",
    });

    return folderRes.data.id;
  }
}

async function findFileInFolder(drive, folderId, fileName) {
  const query = `'${folderId}' in parents and name='${fileName}' and trashed=false`;

  const res = await drive.files.list({
    q: query,
    spaces: "drive",
    fields: "files(id, name)",
  });

  const files = res.data.files;

  if (files.length > 0) {
    // File with the specified name exists in the folder, return its id
    return files[0].id;
  } else {
    // File doesn't exist in the folder
    return null;
  }
}

flutterProcess.stdout.on("data", (data) => {
  // Output from the "flutter run --release" command
  if (data.includes("Built") && fs.existsSync(apkFilePath)) {
    console.log(`APK file found at ${apkFilePath}`);
    authorize().then(uploadApp).catch(console.error);
  }
  console.log(`stdout: ${data}`);
});

flutterProcess.stderr.on("data", (data) => {
  // Error output from the "flutter run --release" command
  console.error(`stderr: ${data}`);
});

flutterProcess.on("close", (code) => {
  console.log(`exited with code ${code}`);
});
