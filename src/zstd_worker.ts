/// <reference lib="webworker" />
import * as fzstd from "fzstd";

const ctx = self as DedicatedWorkerGlobalScope;
const decompressor = new fzstd.Decompress();

(decompressor as any).ondata = (chunk: Uint8Array) => {
    const ab = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
    ctx.postMessage({ type: "data", chunk: ab }, [ab]);
};

ctx.onmessage = (e: MessageEvent) => {
    const { type, chunk, isLast } = e.data || {};
    switch (type) {
        case "push": {
            const input = chunk ? new Uint8Array(chunk) : new Uint8Array(0);
            decompressor.push(input, !!isLast);
            ctx.postMessage({ type: "progress", bytes: input.byteLength });

            if (isLast) {
                ctx.postMessage({ type: "end" });
                ctx.close();
            }
            break;
        }
        case "cancel": {
            try { (decompressor as any).ondata = null; } catch {}
            ctx.close();
            break;
        }
    }
};

export default (null as unknown) as { new (): Worker };
