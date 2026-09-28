const fs = require("node:fs");
const path = require("node:path");
const checker = require("license-checker");

const root = path.resolve(__dirname, "..");
const project = require("../package.json");

checker.init({
    start: root,
    production: true,
    relativeLicensePath: true,
    excludePackages: `${project.name}@${project.version}`,
}, (error, packages) => {
    if (error) throw error;
    const sections = ["# Third-party licenses", "License notices for Meno's production dependencies."];
    for (const name of Object.keys(packages).sort()) {
        const info = packages[name];
        if (!info.licenseFile) throw new Error(`Missing license file for ${name}.`);
        const license = fs.readFileSync(path.resolve(root, info.licenseFile), "utf8").trim();
        if (!license) throw new Error(`Empty license file for ${name}.`);
        // 配布物だけで本文を参照できるようにし、開発環境のpathは出力しない。
        sections.push(`## ${name}`, `License: ${info.licenses}`, "```text\n" + license + "\n```");
    }
    // 全依存の本文を取得できてから書き込み、生成失敗時は既存の一覧を維持する。
    fs.writeFileSync(path.join(root, "THIRD-PARTY-LICENSES.md"), sections.join("\n\n") + "\n");
});
