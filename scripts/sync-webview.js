const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const sourceToTarget = [
  ["index.html", path.join("media", "index.html")],
  ["style.css", path.join("media", "style.css")],
  ["app.js", path.join("media", "app.js")],
];

for (const [srcRel, dstRel] of sourceToTarget) {
  const src = path.join(rootDir, srcRel);
  const dst = path.join(rootDir, dstRel);
  const dstDir = path.dirname(dst);

  if (!fs.existsSync(src)) {
    throw new Error(`Missing source file: ${srcRel}`);
  }

  fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`Synced ${srcRel} -> ${dstRel}`);
}
