import { DataNode, FileReader, FinishCallback, ProgressCallback, ErrorCallback } from "./driver";
import { ReportParser, ReportTree, reportNumber, loadReport, describeReport } from "./report";

type ObjectValue = Record<string, unknown>;
function object(value: unknown, description: string): ObjectValue {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${description}.`);
    return value as ObjectValue;
}
function flag(value: unknown) { return value === true || value === 1 || (typeof value === "string" && /^0*1$/.test(value)); }
type Module = { cells: { name: string, type: string }[], blackbox: boolean, area: number|null, top: boolean };
type Total = { cells: number, area: number, knownArea: boolean };

class YosysParser implements ReportParser {
    recognized = false;
    names = ["cell-count"];
    private lines_: string[] = [];

    read(line: string) {
        if (!this.lines_.length && !line.trim()) return;
        if (!this.lines_.length && !line.trimStart().startsWith("{")) throw new Error("Not a Yosys JSON netlist.");
        if (/"creator"\s*:\s*"Yosys\b/.test(line)) this.recognized = true;
        this.lines_.push(line);
    }

    finish(): DataNode {
        const text = this.lines_.join("\n");
        this.lines_ = [];
        if (/"creator"\s*:\s*"Yosys\b/.test(text)) this.recognized = true;
        let value: unknown;
        try { value = JSON.parse(text); }
        catch { throw new Error("Invalid Yosys JSON netlist."); }
        const design = object(value, "Yosys design");
        if (typeof design.creator !== "string" || !/^Yosys\b/.test(design.creator)) throw new Error("Not a Yosys JSON netlist.");
        this.recognized = true;
        const modules = new Map<string, Module>();
        for (const [name, raw] of Object.entries(object(design.modules, "module table"))) {
            const definition = object(raw, "module");
            const attributes = object(definition.attributes ?? {}, "module attributes");
            const blackbox = flag(attributes.blackbox) || flag(attributes.whitebox);
            if (!blackbox && !definition.cells) throw new Error("Expected write_json output, not stat -json output.");
            const cells = Object.entries(object(definition.cells ?? {}, "cell table")).map(([name, rawCell]) => {
                const cell = object(rawCell, "cell");
                if (typeof cell.type !== "string" || !cell.type) throw new Error("Missing cell type.");
                return { name, type: cell.type };
            });
            const area = attributes.area === undefined ? null : reportNumber(String(attributes.area), "cell area");
            modules.set(name, { cells, blackbox, area, top: flag(attributes.top) });
        }
        let tops = [...modules].filter(([, m]) => m.top && !m.blackbox).map(([name]) => name);
        if (!tops.length) {
            const used = new Set([...modules.values()].flatMap(m => m.cells.map(c => c.type)));
            tops = [...modules].filter(([name, m]) => !m.blackbox && !used.has(name)).map(([name]) => name);
        }
        if (tops.length !== 1) throw new Error("Expected one Yosys top module.");
        const top = tops[0];
        const totals = new Map<string, Total>();
        const active = new Set<string>();
        const pending = [{ name: top, finish: false }];
        // module定義を一度だけ集計し、各instanceへ展開する。再帰参照は明示的に拒否する。
        while (pending.length) {
            const current = pending.pop()!;
            if (totals.has(current.name)) continue;
            const module = modules.get(current.name)!;
            if (!current.finish) {
                if (active.has(current.name)) throw new Error("Recursive Yosys module hierarchy.");
                active.add(current.name);
                pending.push({ name: current.name, finish: true });
                for (const cell of module.cells) {
                    const child = modules.get(cell.type);
                    if (child && !child.blackbox && !totals.has(cell.type)) pending.push({ name: cell.type, finish: false });
                }
            } else {
                const total: Total = { cells: 0, area: 0, knownArea: true };
                for (const cell of module.cells) {
                    const child = modules.get(cell.type);
                    if (child && !child.blackbox) {
                        const data = totals.get(cell.type)!;
                        total.cells += data.cells;
                        total.area += data.area;
                        total.knownArea &&= data.knownArea;
                    } else {
                        total.cells++;
                        total.area += child?.area ?? 0;
                        total.knownArea &&= child?.area !== null && child?.area !== undefined;
                    }
                }
                if (!Number.isSafeInteger(total.cells) || !Number.isFinite(total.area)) throw new Error("Yosys hierarchy total overflow.");
                totals.set(current.name, total);
                active.delete(current.name);
            }
        }
        const hasArea = totals.get(top)!.knownArea;
        this.names = hasArea ? ["cell-area", "cell-count"] : ["cell-count"];
        const tree = new ReportTree(this.names.length);
        const instances = [{ name: top, path: [top] }];
        while (instances.length) {
            const { name, path } = instances.pop()!;
            const data = totals.get(name)!;
            tree.add(path, hasArea ? [data.area, data.cells] : [data.cells]);
            for (const cell of modules.get(name)!.cells) {
                const child = modules.get(cell.type);
                if (child && !child.blackbox) instances.push({ name: cell.type, path: [...path, cell.name] });
            }
        }
        return tree.finish();
    }
}

export default class YosysDriver {
    private parser_ = new YosysParser();
    load(reader: FileReader, finish: FinishCallback, progress: ProgressCallback, error: ErrorCallback) {
        this.parser_ = new YosysParser();
        loadReport(this.parser_, reader, finish, progress, error);
    }
    itemNames() { return this.parser_.names; }
    fileNodeToStr(node: DataNode, root: DataNode, index: number, detailed: boolean) {
        return describeReport(node, root, index, detailed, this.itemNames());
    }
}
