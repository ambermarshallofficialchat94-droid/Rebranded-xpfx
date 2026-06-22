const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Recursively finds ZIP files and extracts them directly to the current
 * working directory (so that a ZIP containing artifacts/ resolves to ./artifacts/).
 */
function unzipAll(dir, rootDir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);

    if (fs.statSync(fullPath).isDirectory()) {
      // Skip already-extracted zip folders and node_modules
      if (file === "node_modules" || /^.*_\d+$/.test(file)) continue;
      unzipAll(fullPath, rootDir);
    } else if (file.endsWith(".zip") && dir === rootDir) {
      // Only process ZIPs in the root directory to avoid double-extraction
      console.log("Unzipping:", fullPath, "→", rootDir);
      execSync(`unzip -o "${fullPath}" -d "${rootDir}"`, { stdio: "inherit" });
    }
  }
}

console.log("🚀 Starting build...");

const rootDir = process.cwd();

// Extract ZIPs so artifacts/ is available
unzipAll(rootDir, rootDir);

// Verify the pre-built API server bundle exists
const expected = path.join(rootDir, "artifacts/api-server/dist/index.mjs");

if (!fs.existsSync(expected)) {
  console.error("❌ ERROR: Pre-built API bundle not found at:");
  console.error("   " + expected);
  console.log("\n📂 Contents of artifacts/:");
  try {
    console.log(fs.readdirSync(path.join(rootDir, "artifacts")));
  } catch {
    console.log("  (artifacts/ directory missing)");
  }
  process.exit(1);
}

console.log("✅ Build completed — API bundle ready at artifacts/api-server/dist/index.mjs");
