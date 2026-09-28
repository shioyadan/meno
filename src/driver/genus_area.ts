import { DataNode, FileReader, FinishCallback, ProgressCallback, ErrorCallback } from "./driver";
import { ReportParser, ReportTree, reportNumber, rounding, loadReport, describeReport } from "./report";

class AreaParser implements ReportParser {
    recognized = false;
    private columns_: string[] = [];
    private ancestors_: { indent: number, path: string[] }[] = [];
    private rows_: { path: string[], values: number[], tolerance: number[] }[] = [];
    private hasCellCount_ = true;
    private root_ = "";
    private format_: "flat" | "indented" | null = null;

    read(line: string) {
        const header = line.trim().replace(/\b(Cell Count|Cell Area|Net Area|Total Area)\b/g, name => name.replace(" ", "-"));
        if (/^Instance\s+Module\b/.test(header)) {
            if (this.rows_.length) throw new Error("Multiple area tables are not supported.");
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
        // トップ行だけModuleが空欄になる。数値や伏せ字の内容ではなく列数で判定する。
        const omittedModule = this.rows_.length === 0 && words.length === this.columns_.length - 1;
        const token = (column: string) => words[this.columns_.indexOf(column) - (omittedModule ? 1 : 0)];
        const names = ["Total-Area", "Cell-Area", "Net-Area", "Cell-Count"];
        const maskedCount = /^x+$/i.test(token("Cell-Count") ?? "");
        const values = names.map((name, i) => i === 3 && maskedCount ? 0 : reportNumber(token(name), name, i === 3));
        if (maskedCount) this.hasCellCount_ = false;
        const tolerance = names.map((name, i) => i === 3 ? 0 : rounding(token(name)));
        const instance = words[0];
        const indent = line.match(/^\s*/u)![0].replace(/\t/g, "    ").length;
        let path: string[];
        if (this.rows_.length === 0) {
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
        this.rows_.push({ path, values, tolerance });
        if (this.format_ !== "flat") this.ancestors_.push({ indent, path });
    }

    finish() {
        if (!this.recognized) throw new Error("Not a Genus area report.");
        if (!this.rows_.length) throw new Error("Area report contains no rows.");
        const count = this.itemNames().length;
        // 加工・丸めを含む連続量は記載値を維持し、件数の整合性は検査する。
        const tree = new ReportTree(count, [], [true, true, true]);
        for (const { path, values, tolerance } of this.rows_) {
            // 一部でも伏せ字なら、未知の件数を0として表示・集計しない。
            tree.add(path, values.slice(0, count), tolerance.slice(0, count));
        }
        this.rows_ = [];
        return tree.finish();
    }

    itemNames() { return this.hasCellCount_ ? ["total", "cell", "net", "cell-count"] : ["total", "cell", "net"]; }
}

export default class GenusAreaDriver {
    private parser_ = new AreaParser();
    load(reader: FileReader, finish: FinishCallback, progress: ProgressCallback, error: ErrorCallback) {
        this.parser_ = new AreaParser();
        loadReport(this.parser_, reader, finish, progress, error);
    }
    itemNames() { return this.parser_.itemNames(); }
    fileNodeToStr(node: DataNode, root: DataNode, index: number, detailed: boolean) {
        return describeReport(node, root, index, detailed, this.itemNames());
    }
}
