import { DataNode, FileReader, FinishCallback, ProgressCallback, ErrorCallback } from "./driver";
import { ReportParser, ReportTree, reportNumber, loadReport, describeReport } from "./report";
import { SharedPowerTable, powerTableKind } from "./genus_joules_power_common";

// GenusとJoulesで共通の列構成を持つ階層表を扱う。
class PowerParser implements ReportParser {
    recognized = false;
    private table_ = new SharedPowerTable();
    private tree_: ReportTree | null = null;
    private rows_ = 0;
    private ancestors_: { level: number, path: string[] }[] = [];

    read(line: string) {
        if (this.table_.readPreamble(line)) return;
        const words = line.trim().split(/\s+/);
        const kind = powerTableKind(words);
        if (kind) {
            if (this.recognized) throw new Error("Multiple power tables are not supported.");
            if (kind !== "hierarchy") throw new Error("Not a hierarchical power report.");
            this.recognized = true;
            this.table_.setColumns(words, ["Cells", "Leakage", "Internal", "Switching", "Total", "Instance"]);
            // 階層表の連続量は加工・丸めによる不一致があっても記載値を保つ。
            const names = this.itemNames();
            this.tree_ = new ReportTree(names.length, [], names.map(name => name !== "cell-count"));
            return;
        }
        if (!this.recognized || !line.trim() || /^\s*[-=]+\s*$/.test(line)) return;
        if (words.length !== this.table_.columns.length) throw new Error("Incomplete power row.");
        const token = (name: string) => words[this.table_.columns.indexOf(name)];
        const { values, tolerances } = this.table_.values(token);
        const instance = token("Instance");
        let path = instance.split("/").filter(Boolean);
        const level = this.table_.columns.includes("Lvl") ? reportNumber(token("Lvl"), "Lvl", true) : null;
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
        this.tree_!.add(path, values, tolerances);
        this.rows_++;
    }

    finish() {
        if (!this.recognized) throw new Error("Not a Genus power report.");
        if (!this.rows_) throw new Error("Power report contains no rows.");
        return this.tree_!.finish();
    }

    itemNames() { return this.table_.itemNames(); }
}

export default class GenusPowerDriver {
    private parser_ = new PowerParser();
    load(reader: FileReader, finish: FinishCallback, progress: ProgressCallback, error: ErrorCallback) {
        this.parser_ = new PowerParser();
        loadReport(this.parser_, reader, finish, progress, error);
    }
    itemNames() { return this.parser_.itemNames(); }
    fileNodeToStr(node: DataNode, root: DataNode, index: number, detailed: boolean) {
        return describeReport(node, root, index, detailed, this.itemNames());
    }
}
