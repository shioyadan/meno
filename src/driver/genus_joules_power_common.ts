import { reportNumber, rounding } from "./report";

// genus_power.ts（Genus/Joules階層表）と
// joules_power_category.ts（Joulesカテゴリ表）の共有基盤。
// 前置き・列判定・指標・数値処理を共通化し、木の構築は各ドライバが担当する。

export function powerTableKind(columns: string[]) {
    if (columns.includes("Category") && columns.includes("Total")) return "category";
    if (columns.includes("Cells") && columns.includes("Instance")) return "hierarchy";
    return null;
}

export class SharedPowerTable {
    unit = "";
    columns: string[] = [];
    private frames_ = 0;
    private metrics_: { name: string, columns: string[] }[] = [];

    readPreamble(line: string) {
        const unit = line.match(/^\s*Power Unit:\s*(W|mW|uW|nW)\s*$/);
        if (unit) { this.unit = unit[1]; return true; }
        if (/^\s*PDB Frame\s*:/.test(line)) {
            if (this.columns.length) throw new Error("Multiple power frames are not supported.");
            // 共通の前置きだけでは形式を確定できないため、列の認識まで検査を保留する。
            this.frames_++;
            return true;
        }
        return false;
    }

    setColumns(columns: string[], required: string[]) {
        if (this.frames_ > 1) throw new Error("Multiple power frames are not supported.");
        if (new Set(columns).size !== columns.length) throw new Error("Duplicate power column.");
        for (const name of required) {
            if (!columns.includes(name)) throw new Error(`Missing ${name} column.`);
        }
        this.columns = columns;
        // 出力された列だけを表示し、動的電力は内訳がそろう場合に補完する。
        this.metrics_ = [
            { name: "total", columns: ["Total"] },
            { name: "dynamic", columns: columns.includes("Dynamic") ? ["Dynamic"] : ["Internal", "Switching"] },
            { name: "int", columns: ["Internal"] },
            { name: "sw", columns: ["Switching"] },
            { name: "leak", columns: ["Leakage"] },
            { name: "cell-count", columns: ["Cells"] },
            { name: "cell-area", columns: ["Area"] },
        ].filter(metric => metric.columns.every(column => columns.includes(column)));
    }

    values(token: (name: string) => string) {
        const values = this.metrics_.map(metric => metric.columns.reduce((sum, name) => sum + reportNumber(token(name), name, name === "Cells"), 0));
        const tolerances = this.metrics_.map(metric => metric.columns.reduce((sum, name) => sum + (name === "Cells" ? 0 : rounding(token(name))), 0));
        return { values, tolerances };
    }

    itemNames() {
        return this.metrics_.map(({ name }) => this.unit && !name.startsWith("cell-") ? `${name} (${this.unit})` : name);
    }
}
