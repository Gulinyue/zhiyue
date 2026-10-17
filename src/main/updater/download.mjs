// Recovered from the supplied Climb 3.0.1 artifact. See docs/RECOVERY.md.
import * as promises from "node:fs/promises";
import * as electron from "electron";
import * as path from "node:path";
import * as node_fs from "node:fs";
import * as node_https from "node:https";
import * as node_http from "node:http";
import * as promises$1 from "node:stream/promises";
import { trustedInstallerDigest, verifyInstallerDigest } from "./integrity.mjs";
import trustedUpdates from "../../shared/trusted-updates.json";

const DESKTOP_DOWNLOAD_PAGE = __CLIMB_WEB_URL__ + "/download";
function installerTarget(rawUrl, target) {
  const url = new URL(rawUrl || DESKTOP_DOWNLOAD_PAGE);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Unsupported installer URL");
  }
  const fileName = decodeURIComponent(url.pathname.split("/").pop() || "").trim();
  if (!fileName || /[<>:"/\\|?*\u0000-\u001f]/.test(fileName) || fileName.length > 180) {
    throw new Error("Invalid installer filename");
  }
  if (target.platform === "darwin") {
    if (!/\.(dmg|zip)$/i.test(fileName)) throw new Error("Mac updates require a DMG or ZIP installer");
    if (!["arm64", "x64"].includes(target.arch)) throw new Error("Unsupported Mac architecture");
    const namedArch = /(?:^|[-_.])(arm64|x64|universal)(?=[-_.]|$)/i.exec(fileName)?.[1].toLowerCase();
    if (namedArch && namedArch !== "universal" && namedArch !== target.arch) {
      throw new Error("Installer architecture does not match this Mac");
    }
  } else if (target.platform !== "win32" || !/\.exe$/i.test(fileName)) {
    throw new Error("No compatible installer for this platform");
  }
  return { url, fileName };
}
async function verifyInstallerFile(path2, fileName) {
  const file = await promises.open(path2, "r");
  try {
    const size = (await file.stat()).size;
    const signature = Buffer.alloc(4);
    const isDmg = /\.dmg$/i.test(fileName);
    if (size < (isDmg ? 512 : 4)) throw new Error("Installer download is incomplete");
    await file.read(signature, 0, 4, isDmg ? size - 512 : 0);
    const valid2 = isDmg ? signature.toString("ascii") === "koly" : /\.zip$/i.test(fileName) ? signature.equals(Buffer.from([80, 75, 3, 4])) : signature.subarray(0, 2).toString("ascii") === "MZ";
    if (!valid2) throw new Error("Downloaded file is not the expected installer format");
  } finally {
    await file.close();
  }
}
let downloadInFlight = null;
async function downloadAndInstallDesktopUpdate(downloadUrl, onProgress) {
  if (downloadInFlight) return downloadInFlight;
  downloadInFlight = (async () => {
    let tempDir;
    let tempPath;
    try {
      const { url: installerUrl, fileName } = installerTarget(downloadUrl, process);
      const expectedDigest = trustedInstallerDigest(installerUrl.href, trustedUpdates);
      const downloadsDir = electron.app.getPath("downloads");
      await promises.mkdir(downloadsDir, { recursive: true });
      tempDir = await promises.mkdtemp(path.join(downloadsDir, ".climb-update-"));
      tempPath = path.join(tempDir, "installer.download");
      onProgress?.({ percent: 0, transferredBytes: 0 });
      await downloadUrlToFile(installerUrl, tempPath, 0, onProgress);
      await verifyInstallerFile(tempPath, fileName);
      await verifyInstallerDigest(tempPath, expectedDigest);
      let filePath = path.join(downloadsDir, fileName);
      for (let attempt = 0; ; attempt += 1) {
        try {
          await promises.copyFile(tempPath, filePath, node_fs.constants.COPYFILE_EXCL);
          break;
        } catch (error) {
          if (error.code !== "EEXIST" || attempt >= 100) throw error;
          const ext = path.extname(fileName);
          filePath = path.join(downloadsDir, `${fileName.slice(0, -ext.length)} (${attempt + 1})${ext}`);
        }
      }
      onProgress?.({ percent: 100, transferredBytes: 0 });
      electron.shell.showItemInFolder(filePath);
      return {
        status: "downloaded",
        filePath,
        message: process.platform === "darwin" ? "Mac 安装包已下载，已在 Finder 中显示。请退出 Climb，打开 DMG（ZIP 请先解压），将 Climb 拖入「应用程序」并替换旧版。" : "安装包已下载到您的「下载」文件夹，文件资源管理器已自动打开。请关闭本应用后，双击安装包完成更新。"
      };
    } catch (err) {
      console.error("[climb:updater] installer download failed:", err);
      await electron.shell.openExternal(DESKTOP_DOWNLOAD_PAGE);
      return {
        status: "fallback",
        message: "安装包下载失败，已打开官网下载页，请手动下载安装。"
      };
    } finally {
      if (tempPath) await promises.rm(tempPath, { force: true }).catch(() => void 0);
      if (tempDir) await promises.rmdir(tempDir).catch(() => void 0);
      downloadInFlight = null;
    }
  })();
  return downloadInFlight;
}
async function downloadUrlToFile(url, filePath, redirectCount = 0, onProgress) {
  if (redirectCount > 5) throw new Error("Too many installer download redirects");
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Unsupported installer redirect");
  }
  await new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? node_https.get : node_http.get;
    const req = client(
      url,
      {
        headers: {
          "User-Agent": "Climb-Updater"
        }
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location) {
          res.resume();
          try {
            downloadUrlToFile(new URL(location, url), filePath, redirectCount + 1, onProgress).then(resolve, reject);
          } catch (error) {
            reject(error);
          }
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`Installer download failed with HTTP ${status}`));
          return;
        }
        if (/text\/html|application\/json/i.test(res.headers["content-type"] ?? "")) {
          res.resume();
          reject(new Error("Installer URL returned a web page instead of an installer"));
          return;
        }
        const file = node_fs.createWriteStream(filePath);
        const totalBytesHeader = res.headers["content-length"];
        const totalBytes = typeof totalBytesHeader === "string" ? Number(totalBytesHeader) : void 0;
        let transferredBytes = 0;
        res.on("data", (chunk) => {
          transferredBytes += chunk.length;
          const percent = totalBytes && Number.isFinite(totalBytes) && totalBytes > 0 ? Math.min(99, Math.round(transferredBytes / totalBytes * 100)) : 0;
          onProgress?.({
            percent,
            transferredBytes,
            totalBytes: totalBytes && Number.isFinite(totalBytes) ? totalBytes : void 0
          });
        });
        promises$1.pipeline(res, file).then(resolve, reject);
      }
    );
    req.setTimeout(12e4, () => {
      req.destroy(new Error("Installer download timed out"));
    });
    req.on("error", reject);
  });
}

export { DESKTOP_DOWNLOAD_PAGE, installerTarget, verifyInstallerFile, downloadInFlight, downloadAndInstallDesktopUpdate, downloadUrlToFile };
