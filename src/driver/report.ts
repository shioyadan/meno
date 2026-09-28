import { DataNode, FileReader, FinishCallback, ProgressCallback, ErrorCallback, formatNumberCompact } from "./driver";

const DECIMAL = /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

export function reportNumber(token: string, column: string, integer = false): number {
    const value = Number(token);
    if (!DECIMAL.test(token ?? "") || !Number.isFinite(value) || value < 0 ||
        (integer && !Number.isSafeInteger(value))) {
        throw new Error(`Invalid ${column} value.`);
    }
    return value;
}

export function rounding(token: string): number {
    const [mantissa, exponent = "0"] = token.toLowerCase().split("e");
    const places = (mantissa.split(".")[1] ?? "").length;
    const precision = Math.pow(10, Number(exponent) - places) / 2;
    if (!Number.isFinite(precision)) throw new Error("Invalid numeric precision.");
    return precision;
}

// 形式別の行解析から独立して、明示された合計と補完した階層を集計する。
export class ReportTree {
    private root_ = new DataNode();
    private nodes_: DataNode[] = [];
    private explicit_ = new Map<DataNode, { data: number[], tolerance: number[] }>();
    private nextId_ = 0;

    constructor(private metrics_: number, private local_: boolean[] = [], private allowExcess_: boolean[] = []) {
        this.root_.children = Object.create(null);
    }

    add(path: string[], data: number[], tolerance = data.map(v => Math.abs(v) * Number.EPSILON * 8)) {
        if (!path.length || path.some(part => !part) || data.length !== this.metrics_ ||
            data.some(value => !Number.isFinite(value) || value < 0)) {
            throw new Error("Invalid report row.");
        }
        let node = this.root_;
        for (const key of path) {
            let child = node.children![key];
            if (!child) {
                child = new DataNode();
                child.children = Object.create(null);
                child.key = key;
                child.id = this.nextId_++;
                child.parent = node;
                child.data = Array(this.metrics_).fill(0);
                node.children![key] = child;
                this.nodes_.push(child);
            }
            node = child;
        }
        if (this.explicit_.has(node)) throw new Error("Duplicate instance path.");
        this.explicit_.set(node, { data, tolerance });
    }

    private groupChildren(node: DataNode) {
        const children = node.children!;
        node.children = Object.create(null);
        for (const child of Object.values(children)) {
            const parts = child.key.split(/(\[[^\]]*\])/).filter(Boolean);
            let parent = node;
            let prefix = "";
            for (let i = 0; i < parts.length; i++) {
                prefix += parts[i];
                // 実在する兄弟名と衝突する接頭辞はグループにしない。
                if (i === parts.length - 1 || children[prefix]) {
                    child.key = parts.slice(i).join("");
                    child.parent = parent;
                    parent.children![child.key] = child;
                    break;
                }
                let group = parent.children![parts[i]];
                if (!group) {
                    group = new DataNode();
                    group.children = Object.create(null);
                    group.key = parts[i];
                    group.id = this.nextId_++;
                    group.parent = parent;
                    group.data = Array(this.metrics_).fill(0);
                    parent.children![group.key] = group;
                }
                group.data = group.data.map((value, index) => value + child.data[index]);
                parent = group;
            }
        }
    }

    finish(): DataNode {
        const roots = Object.values(this.root_.children!);
        if (roots.length !== 1) throw new Error("Expected one report root.");
        const tolerances = new Map<DataNode, number[]>();
        // 作成順は親が先になるため、逆順なら深い階層でも再帰せず確定できる。
        for (let n = this.nodes_.length - 1; n >= 0; n--) {
            const node = this.nodes_[n];
            const children = Object.values(node.children!);
            const row = this.explicit_.get(node);
            const remainder: number[] = [];
            const tolerance: number[] = [];
            let hasRemainder = false;
            for (let i = 0; i < this.metrics_; i++) {
                const sum = children.reduce((value, child) => value + child.data[i], 0);
                const childTolerance = children.reduce((value, child) => value + tolerances.get(child)![i], 0);
                const comparisonTolerance = (row?.tolerance[i] ?? 0) + childTolerance;
                tolerance[i] = row && !this.local_[i] ? row.tolerance[i] : comparisonTolerance;
                const total = row ? row.data[i] + (this.local_[i] ? sum : 0) : sum;
                if (!Number.isFinite(total) || !Number.isFinite(sum)) throw new Error("Report total overflow.");
                const difference = total - sum;
                const epsilon = Math.max(comparisonTolerance, Math.abs(total) * Number.EPSILON * 8);
                if (difference < -epsilon && !this.allowExcess_[i]) throw new Error("Child totals exceed their parent.");
                hasRemainder ||= difference > epsilon;
                remainder[i] = Math.max(0, difference);
                node.data[i] = total;
            }
            tolerances.set(node, tolerance);
            if (children.length && hasRemainder) {
                let key = "others";
                for (let suffix = 2; node.children![key]; suffix++) key = `others (${suffix})`;
                const rest = new DataNode();
                rest.children = Object.create(null);
                rest.key = key;
                rest.id = this.nextId_++;
                rest.parent = node;
                rest.data = remainder;
                node.children![key] = rest;
            }
            // 表示用の配列グループは、実際の階層で集計を終えてから作る。
            this.groupChildren(node);
        }
        roots[0].parent = null;
        return roots[0];
    }
}

export interface ReportParser {
    recognized: boolean;
    read(line: string, lineNumber: number): void;
    finish(): DataNode;
}

export function loadReport(parser: ReportParser, reader: FileReader, finish: FinishCallback,
    progress: ProgressCallback, error: ErrorCallback) {
    let lineNumber = 0;
    let failed = false;
    const fail = (reason: unknown) => {
        failed = true;
        const detail = reason instanceof Error ? reason.message : String(reason);
        reader.cancel(() => error(`Line ${lineNumber}: ${detail}`, parser.recognized));
    };
    reader.onReadLine(line => {
        if (failed) return;
        lineNumber++;
        try {
            parser.read(line, lineNumber);
            if ((lineNumber & 1023) === 0 && parser.recognized) progress("Loading report");
        } catch (reason) { fail(reason); }
    });
    reader.onClose(() => {
        if (failed || reader.isCanceled()) return;
        try {
            const root = parser.finish();
            progress("Report loaded");
            if (!reader.isCanceled()) finish(root);
        } catch (reason) { fail(reason); }
    });
    reader.load();
}

export function describeReport(node: DataNode, root: DataNode, index: number, detailed: boolean, names: string[]) {
    const value = node.data[index];
    const percentage = root.data[index] > 0 ? (value / root.data[index] * 100).toFixed(2) : "0.00";
    const values = detailed ? names.map((name, i) => `${name}: ${formatNumberCompact(node.data[i])}`).join(", ") : formatNumberCompact(value);
    return ` [${values} (${percentage}%)]`;
}
