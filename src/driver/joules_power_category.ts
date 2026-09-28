import { DataNode, FileReader, FinishCallback, ProgressCallback, ErrorCallback } from "./driver";
import { ReportParser, ReportTree, loadReport, describeReport } from "./report";
import { SharedPowerTable, powerTableKind } from "./genus_joules_power_common";

class CategoryParser implements ReportParser {
    recognized = false;
    private table_ = new SharedPowerTable();
    private tree_: ReportTree | null = null;
    private subtotal_ = false;
    private rows_ = 0;

    read(line: string) {
        if (this.table_.readPreamble(line)) return;
        const words = line.trim().split(/\s+/);
        const kind = powerTableKind(words);
        if (kind) {
            if (this.recognized) throw new Error("Multiple power tables are not supported.");
            if (kind !== "category") throw new Error("Not a power category report.");
            this.recognized = true;
            this.table_.setColumns(words, ["Category", "Leakage", "Total"]);
            if (!words.includes("Dynamic") && !(words.includes("Internal") && words.includes("Switching"))) {
                throw new Error("Missing Dynamic or Internal and Switching columns.");
            }
            this.tree_ = new ReportTree(this.itemNames().length);
            return;
        }
        if (!this.recognized || !line.trim() || /^\s*[-=]+\s*$/.test(line)) return;
        if (words.length !== this.table_.columns.length) throw new Error("Incomplete power row.");
        const token = (name: string) => words[this.table_.columns.indexOf(name)];
        const name = token("Category");
        if (name === "Percentage") {
            if (!this.subtotal_) throw new Error("Power percentages precede the subtotal.");
            return;
        }
        if (this.subtotal_) throw new Error("Unexpected row after power subtotal.");
        const { values, tolerances } = this.table_.values(token);
        // Subtotalを親として使い、Percentage行や合計の二重計上を避ける。
        this.subtotal_ = name === "Subtotal";
        this.tree_!.add(this.subtotal_ ? ["Total"] : ["Total", name], values, tolerances);
        if (!this.subtotal_) this.rows_++;
    }

    finish() {
        if (!this.recognized) throw new Error("Not a power category report.");
        if (!this.rows_) throw new Error("Power report contains no rows.");
        if (!this.subtotal_) throw new Error("Power category report has no subtotal.");
        return this.tree_!.finish();
    }

    itemNames() { return this.table_.itemNames(); }
}

export default class JoulesPowerCategoryDriver {
    private parser_ = new CategoryParser();
    load(reader: FileReader, finish: FinishCallback, progress: ProgressCallback, error: ErrorCallback) {
        this.parser_ = new CategoryParser();
        loadReport(this.parser_, reader, finish, progress, error);
    }
    itemNames() { return this.parser_.itemNames(); }
    fileNodeToStr(node: DataNode, root: DataNode, index: number, detailed: boolean) {
        return describeReport(node, root, index, detailed, this.itemNames());
    }
}
