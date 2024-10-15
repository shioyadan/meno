import { FileReader, FileNode, FileContext, 
    FinishCallback, ProgressCallback} from "./driver/driver";
import FileInfoDriver from "./driver/file_info";

class Loader {
    driver_: FileInfoDriver | null;
    constructor() {
        this.driver_ = null;
    }
    load(reader: FileReader, finishCallback: FinishCallback, progressCallback: ProgressCallback) {
        this.driver_ = new FileInfoDriver();
        this.driver_.load(reader, finishCallback, progressCallback);
    }

    fileNodeToStr(fileNode: FileNode, isSizeMode: boolean) {
        return this.driver_ ? this.driver_.fileNodeToStr(fileNode, isSizeMode) : "";
    }
    
};

export { FileReader, Loader, FileNode, FileContext };