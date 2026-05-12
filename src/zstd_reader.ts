import ZstdWorker from "./zstd_worker";

type OutQueueItem = {
    buf: Uint8Array;
    credit: number;
};

const getFZSTD_Reader = (
    stream: ReadableStream<Uint8Array>,
    _fileName: string,
    _fileSize: number,
    updateByteReads: (bytes: number) => void
) => {
    const compressedReader = stream.getReader();
    const worker = new ZstdWorker();

    const outQueue: OutQueueItem[] = [];
    let pendingResolve: ((v: OutQueueItem | null) => void) | null = null;
    let endedFromWorker = false;
    let eofSent = false;
    let creditCarry = 0;

    const attachCreditToTail = (bytes: number) => {
        if (bytes <= 0) return;
        for (let i = outQueue.length - 1; i >= 0; i--) {
            if (outQueue[i].credit === 0) {
                outQueue[i].credit = bytes;
                return;
            }
        }
        creditCarry += bytes;
    };

    worker.onmessage = (e: MessageEvent) => {
        const { type } = e.data || {};
        if (type === "data") {
            const data = new Uint8Array(e.data.chunk);
            const item: OutQueueItem = { buf: data, credit: 0 };
            if (creditCarry > 0) {
                item.credit = creditCarry >>> 0;
                creditCarry = 0;
            }

            if (pendingResolve) {
                const resolve = pendingResolve;
                pendingResolve = null;
                resolve(item);
            } else {
                outQueue.push(item);
            }
        } else if (type === "progress") {
            const bytes: number = e.data.bytes;
            if (bytes > 0) {
                attachCreditToTail(bytes);
            }
        } else if (type === "end") {
            endedFromWorker = true;
            if (pendingResolve && outQueue.length === 0) {
                const resolve = pendingResolve;
                pendingResolve = null;
                resolve(null);
            }
        }
    };

    const decompressedStream = new ReadableStream<Uint8Array>({
        pull: async (controller) => {
            if (outQueue.length > 0) {
                const { buf, credit } = outQueue.shift()!;
                controller.enqueue(buf);
                if (credit > 0) updateByteReads(credit);
                return;
            }

            if (endedFromWorker) {
                controller.close();
                try { worker.terminate(); } catch {}
                return;
            }

            const nextItem = await new Promise<OutQueueItem | null>(async (resolve) => {
                pendingResolve = resolve;

                const { done, value } = await compressedReader.read();
                if (done) {
                    if (!eofSent) {
                        eofSent = true;
                        const empty = new Uint8Array(0);
                        worker.postMessage({ type: "push", chunk: empty, isLast: true }, [empty.buffer]);
                        await compressedReader.cancel().catch(() => {});
                    }
                    return;
                }

                if (value && value.byteLength > 0) {
                    worker.postMessage({ type: "push", chunk: value, isLast: false }, [value.buffer]);
                }
            });

            if (nextItem) {
                controller.enqueue(nextItem.buf);
                if (nextItem.credit > 0) updateByteReads(nextItem.credit);
                return;
            }

            controller.close();
            try { worker.terminate(); } catch {}
        },
        cancel: async () => {
            try { worker.postMessage({ type: "cancel" }); } catch {}
            try { worker.terminate(); } catch {}
            await compressedReader.cancel().catch(() => {});
        }
    });

    return decompressedStream.getReader();
};

export default getFZSTD_Reader;
