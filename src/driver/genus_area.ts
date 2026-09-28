import { DataNode, FileReader, FinishCallback, ProgressCallback, ErrorCallback } from "./driver";
import { ReportParser, ReportTree, reportNumber, rounding, loadReport, describeReport } from "./report";

class AreaParser implements ReportParser {
    recognized = false;
    private columns_: string[] = [];
    private tree_ = new ReportTree(4);
    private ancestors_: { indent: number, path: string[] }[] = [];
    private rows_ = 0;
    private root_ = "";
    private format_: "flat" | "indented" | null = null;

    read(line: string) {
        const header = line.trim().replace(/\b(Cell Count|Cell Area|Net Area|Total Area)\b/g, name => name.replace(" ", "-"));
        if (/^Instance\s+Module\b/.test(header)) {
            if (this.rows_) throw new Error("Multiple area tables are not supported.");
            this.recognized = true;
            this.columns_ = header.split(/\s+/);
            if (new Set(this.columns_).size !== this.columns_.length) throw new Error("Duplicate area column.");
            for (const name of ["Cell-Count", "Cell-Area", "Net-Area", "Total-Area"]) {
                if (!this.columns_.includes(name)) throw new Error(`Missing ${name} column.`);
            }
            return;
        }
        if (!this.recognized || !line.trim() || /^\s*[-=]+\s*$/.test(line) || /^\s*\([A-Za-z]\)\s*=/.test(line)) return;
        const words = line.trim().split(/\s+/);
        // トップ行だけModuleが空欄になる。後続のWireload列数には依存しない。
        const omittedModule = this.rows_ === 0 && /^[+\d.]/.test(words[1] ?? "");
        const token = (column: string) => words[this.columns_.indexOf(column) - (omittedModule ? 1 : 0)];
        const names = ["Total-Area", "Cell-Area", "Net-Area", "Cell-Count"];
        const values = names.map((name, i) => reportNumber(token(name), name, i === 3));
        const tolerance = names.map((name, i) => i === 3 ? 0 : rounding(token(name)));
        const instance = words[0];
        const indent = line.match(/^\s*/u)![0].replace(/\t/g, "    ").length;
        let path: string[];
        if (this.rows_ === 0) {
            path = instance.split("/").filter(Boolean);
            if (path.length !== 1) throw new Error("Expected a top-level area row first.");
            this.root_ = path[0];
        } else if (instance.includes("/")) {
            if (this.format_ === "indented") throw new Error("Mixed area path formats.");
            this.format_ = "flat";
            path = instance.split("/").filter(Boolean);
            if (path[0] !== this.root_) throw new Error("Instance is outside the report root.");
        } else {
            if (this.format_ === "flat") throw new Error("Mixed area path formats.");
            this.format_ = "indented";
            while (this.ancestors_.length && this.ancestors_[this.ancestors_.length - 1].indent >= indent) this.ancestors_.pop();
            const parent = this.ancestors_[this.ancestors_.length - 1];
            if (!parent) throw new Error("Invalid area hierarchy indentation.");
            path = [...parent.path, instance];
        }
        this.tree_.add(path, values, tolerance);
        if (this.format_ !== "flat") this.ancestors_.push({ indent, path });
        this.rows_++;
    }

    finish() {
        if (!this.recognized) throw new Error("Not a Genus area report.");
        if (!this.rows_) throw new Error("Area report contains no rows.");
        return this.tree_.finish();
    }
}

export default class GenusAreaDriver {
    load(reader: FileReader, finish: FinishCallback, progress: ProgressCallback, error: ErrorCallback) {
        loadReport(new AreaParser(), reader, finish, progress, error);
    }
    itemNames() { return ["total", "cell", "net", "cell-count"]; }
    fileNodeToStr(node: DataNode, root: DataNode, index: number, detailed: boolean) {
        return describeReport(node, root, index, detailed, this.itemNames());
    }
}
