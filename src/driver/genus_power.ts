import { DataNode, FileReader, FinishCallback, ProgressCallback, ErrorCallback } from "./driver";
import { ReportParser, ReportTree, reportNumber, rounding, loadReport, describeReport } from "./report";

class PowerParser implements ReportParser {
    recognized = false;
    unit = "";
    private frames_ = 0;
    private columns_: string[] = [];
    private tree_ = new ReportTree(6);
    private rows_ = 0;
    private ancestors_: { level: number, path: string[] }[] = [];

    read(line: string) {
        const unit = line.match(/^\s*Power Unit:\s*(W|mW|uW|nW)\s*$/);
        if (unit) { this.unit = unit[1]; return; }
        if (/^\s*PDB Frame\s*:/.test(line)) {
            this.recognized = true;
            if (++this.frames_ > 1 || this.rows_) throw new Error("Multiple power frames are not supported.");
            return;
        }
        const words = line.trim().split(/\s+/);
        if (words.includes("Cells") && words.includes("Instance")) {
            this.recognized = true;
            if (this.columns_.length) throw new Error("Multiple power tables are not supported.");
            this.columns_ = words;
            if (new Set(words).size !== words.length) throw new Error("Duplicate power column.");
            for (const name of ["Cells", "Leakage", "Internal", "Switching", "Total", "Instance"]) {
                if (!words.includes(name)) throw new Error(`Missing ${name} column.`);
            }
            return;
        }
        if (!this.columns_.length || !line.trim() || /^\s*[-=]+\s*$/.test(line)) return;
        if (words.length !== this.columns_.length) throw new Error("Incomplete power row.");
        const token = (name: string) => words[this.columns_.indexOf(name)];
        const get = (name: string) => reportNumber(token(name), name, name === "Cells");
        const internal = get("Internal"), switching = get("Switching");
        const hasDynamic = this.columns_.includes("Dynamic");
        const dynamic = hasDynamic ? get("Dynamic") : internal + switching;
        const tolerance = (name: string) => rounding(token(name));
        const instance = token("Instance");
        let path = instance.split("/").filter(Boolean);
        const level = this.columns_.includes("Lvl") ? reportNumber(token("Lvl"), "Lvl", true) : null;
        if (level !== null) {
            while (this.ancestors_.length && this.ancestors_[this.ancestors_.length - 1].level >= level) this.ancestors_.pop();
            // 短いinstance名の形式では、列位置や空白幅ではなく階層レベルで親を決める。
            if (!instance.includes("/") && level > 0) {
                const parent = this.ancestors_[this.ancestors_.length - 1];
                if (!parent || parent.level !== level - 1) throw new Error("Missing parent for power hierarchy level.");
                path = [...parent.path, ...path];
            }
            this.ancestors_.push({ level, path });
        } else if (!instance.includes("/") && this.rows_) {
            throw new Error("Relative power paths require a Lvl column.");
        }
        this.tree_.add(path,
            [get("Total"), dynamic, internal, switching, get("Leakage"), get("Cells")],
            [tolerance("Total"), hasDynamic ? tolerance("Dynamic") : tolerance("Internal") + tolerance("Switching"),
                tolerance("Internal"), tolerance("Switching"), tolerance("Leakage"), 0]);
        this.rows_++;
    }

    finish() {
        if (!this.recognized) throw new Error("Not a Genus power report.");
        if (!this.rows_) throw new Error("Power report contains no rows.");
        return this.tree_.finish();
    }
}

export default class GenusPowerDriver {
    private parser_ = new PowerParser();
    load(reader: FileReader, finish: FinishCallback, progress: ProgressCallback, error: ErrorCallback) {
        this.parser_ = new PowerParser();
        loadReport(this.parser_, reader, finish, progress, error);
    }
    itemNames() {
        return ["total", "dynamic", "int", "sw", "leak"].map(name => this.parser_.unit ? `${name} (${this.parser_.unit})` : name).concat("cell-count");
    }
    fileNodeToStr(node: DataNode, root: DataNode, index: number, detailed: boolean) {
        return describeReport(node, root, index, detailed, this.itemNames());
    }
}
