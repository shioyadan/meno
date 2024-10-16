import { FileReader, FileNode, FinishCallback, ProgressCallback, ErrorCallback} from "./driver/driver";

import FileInfoDriver from "./driver/file_info";
import DC_AreaDriver from "./driver/dc_area";

class Loader {
    driver_: FileInfoDriver | DC_AreaDriver | null;
    constructor() {
        this.driver_ = null;
    }
    load(reader: FileReader, finishCallback: FinishCallback, 
        progressCallback: ProgressCallback, errorCallback: ErrorCallback
    ) {
        // this.driver_ = new FileInfoDriver();
        this.driver_ = new DC_AreaDriver();
        this.driver_.load(
            reader, finishCallback, progressCallback, errorCallback);
    }

    fileNodeToStr(fileNode: FileNode, isSizeMode: boolean) {
        return this.driver_ ? this.driver_.fileNodeToStr(fileNode, isSizeMode) : "";
    }
    
};

export { FileReader, Loader, FileNode };