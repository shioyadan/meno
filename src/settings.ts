// settings.ts

class Settings { 
    uiTheme: string = "dark";

    save() {
        try {
            localStorage.setItem("settings", JSON.stringify(this));
        } catch (e) {
            console.error("Settings.save failed:", e);
        }
    }

    load() {
        try {
            const raw = localStorage.getItem("settings");
            if (!raw) return; // 何も保存されていない場合は初期値のまま

            const obj = JSON.parse(raw);
            if (!obj || typeof obj !== "object") return;

            // 既存インスタンスの自前プロパティだけを安全に上書き（浅いマージ）
            for (const key of Object.keys(this)) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const val = (obj as any)[key];
                    if (val !== undefined) {
                        (this as any)[key] = val;
                    }
                }
            }
        } catch (e) {
            console.error("Settings.load failed:", e);
            // 失敗時は最低限の復旧（必要なら他のプロパティも同様に初期化）
            this.uiTheme = "dark";
        }
    }
};

export {Settings};
