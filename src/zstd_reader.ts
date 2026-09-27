import ZstdWorker from "./zstd_worker";

const getFZSTD_Reader = (
    stream: ReadableStream<Uint8Array>,
    _fileName: string,
    _fileSize: number,
    updateByteReads: (bytes: number) => void
) => {
    const compressedReader = stream.getReader();
    const worker = new ZstdWorker();
    let stopped = false;
    let finishing = false;
    let produced = false;
    let acknowledge: (() => void) | null = null;

    const stop = () => {
        stopped = true;
        worker.terminate();
        acknowledge?.();
        acknowledge = null;
    };

    const decompressedStream = new ReadableStream<Uint8Array>({
        start(controller) {
            worker.onmessage = (e: MessageEvent) => {
                if (stopped) return;
                const { type, chunk, bytes } = e.data;
                if (type === "data") {
                    produced = true;
                    controller.enqueue(new Uint8Array(chunk));
                } else if (type === "progress") {
                    updateByteReads(bytes);
                    if (!finishing) {
                        acknowledge?.();
                        acknowledge = null;
                    }
                } else if (type === "end") {
                    controller.close();
                    stop();
                }
            };
            worker.onerror = (event: ErrorEvent) => {
                if (stopped) return;
                event.preventDefault?.();
                controller.error(new Error(event.message || "Could not decompress input"));
                stop();
                void compressedReader.cancel().catch(() => {});
            };
        },
        async pull() {
            try {
                produced = false;
                do {
                    const { done, value } = await compressedReader.read();
                    if (stopped) return;
                    finishing = done;
                    // 出力がないheader断片もprogressで完了を待ち、次の断片へ進む。
                    // 1入力ずつWorkerへ渡し、consumerより先にファイル全体を展開しない。
                    await new Promise<void>((resolve) => {
                        acknowledge = resolve;
                        const chunk = value ?? new Uint8Array(0);
                        worker.postMessage({ type: "push", chunk, isLast: done }, [chunk.buffer]);
                    });
                } while (!stopped && !produced);
            } catch (error) {
                stop();
                await compressedReader.cancel().catch(() => {});
                throw error;
            }
        },
        async cancel() {
            stop();
            await compressedReader.cancel().catch(() => {});
        },
    });

    return decompressedStream.getReader();
};

export default getFZSTD_Reader;
