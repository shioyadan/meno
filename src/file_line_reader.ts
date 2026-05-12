import getFZSTD_Reader from "./zstd_reader";

export interface FileLineReaderOptions {
    file?: File;
    stream?: ReadableStream<Uint8Array>;
    fileName?: string;
    fileSize?: number;
}

export class FileLineReader {
    private reader_!: ReadableStreamDefaultReader<Uint8Array>;
    private decoder_ = new TextDecoder("utf-8");
    private buffer_ = "";
    private bytesRead_ = 0;
    private numLine_ = 0;
    private initialized_ = false;
    private isZstd_ = false;
    private canceled_ = false;

    private stream_: ReadableStream<Uint8Array>;
    private fileName_: string;
    private fileSize_: number;

    constructor(options: FileLineReaderOptions) {
        if (options.file) {
            const file = options.file;
            this.stream_ = file.stream() || new Response(file).body as ReadableStream<Uint8Array>;
            this.fileName_ = file.name;
            this.fileSize_ = file.size;
        } else if (options.stream) {
            this.stream_ = options.stream;
            this.fileName_ = options.fileName ?? "unknown";
            this.fileSize_ = options.fileSize ?? 0;
        } else {
            throw new Error("Either file or stream must be provided.");
        }
    }

    getProgress(): number {
        const total = this.fileSize_;
        if (total === 0) return 1;
        return Math.min(1, this.bytesRead_ / total);
    }

    private init_(): void {
        if (this.initialized_) return;
        this.initialized_ = true;

        if (/\.(zst|zstd)(?:\.txt)?$/i.test(this.fileName_)) {
            this.isZstd_ = true;
            this.reader_ = getFZSTD_Reader(
                this.stream_,
                this.fileName_,
                this.fileSize_,
                (bytes) => { this.bytesRead_ += bytes; }
            );
        } else {
            this.reader_ = this.stream_.getReader();
        }
    }

    private async readLine_(): Promise<string | null> {
        this.numLine_++;
        if (this.numLine_ % 50000 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
            if (this.canceled_) return null;
        }

        let newlineIndex = this.buffer_.indexOf("\n");
        if (newlineIndex !== -1) {
            const line = this.buffer_.slice(0, newlineIndex);
            this.buffer_ = this.buffer_.slice(newlineIndex + 1);
            return line;
        }

        while (!this.canceled_) {
            const { done, value } = await this.reader_.read();
            if (done) {
                this.bytesRead_ = this.fileSize_;
                this.buffer_ += this.decoder_.decode();
                if (this.buffer_.length > 0) {
                    const line = this.buffer_;
                    this.buffer_ = "";
                    return line;
                }
                return null;
            }

            if (value) {
                this.buffer_ += this.decoder_.decode(value, { stream: true });
                if (!this.isZstd_) {
                    this.bytesRead_ += value.byteLength;
                }
            }

            newlineIndex = this.buffer_.indexOf("\n");
            if (newlineIndex !== -1) {
                const line = this.buffer_.slice(0, newlineIndex);
                this.buffer_ = this.buffer_.slice(newlineIndex + 1);
                return line;
            }
        }

        return null;
    }

    async load(
        onLineRead: (line: string) => void,
        finishCallback: () => void,
        errorCallback: (e: unknown) => void
    ): Promise<void> {
        try {
            this.init_();

            let line: string | null;
            while ((line = await this.readLine_()) !== null) {
                if (this.canceled_) return;
                onLineRead(line);
            }
            if (!this.canceled_) {
                finishCallback();
            }
        } catch (e) {
            errorCallback(e);
        }
    }

    cancel() {
        this.canceled_ = true;
        if (this.reader_) {
            this.reader_.cancel();
        }
    }
}
