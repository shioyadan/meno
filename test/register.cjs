const fs = require('node:fs');
const ts = require('typescript');
const { Worker } = require('node:worker_threads');
const workers = new Set();

function compile(filename) {
    return ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText;
}

require.extensions['.ts'] = (module, filename) => {
    const source = compile(filename);
    if (filename.endsWith('/zstd_worker.ts')) {
        // webpackのWorker境界だけをNodeへ置き換え、実際の圧縮処理を検証する。
        module.exports = { __esModule: true, default: class {
            constructor() {
                this.worker = new Worker(`
                    const { parentPort } = require('node:worker_threads');
                    global.self = {
                        postMessage: (data, transfer) => parentPort.postMessage(data, transfer),
                        close: () => parentPort.close()
                    };
                    parentPort.on('message', data => self.onmessage({ data }));
                    const load = require('node:module').createRequire(${JSON.stringify(filename)});
                    new Function('require', 'exports', ${JSON.stringify(source)})(load, {});
                `, { eval: true });
                workers.add(this.worker);
                this.worker.on('message', data => this.onmessage?.({ data }));
                this.worker.on('error', error => this.onerror?.(error));
                this.worker.on('exit', () => workers.delete(this.worker));
            }
            postMessage(data, transfer) { this.worker.postMessage(data, transfer); }
            terminate() { return this.worker.terminate(); }
        } };
    } else {
        module._compile(source, filename);
    }
};

module.exports = { stopWorkers: () => Promise.all([...workers].map(worker => worker.terminate())) };
