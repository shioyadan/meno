import { FileReader, FileNode, FinishCallback, ProgressCallback, ErrorCallback} from "./driver/driver";

import FileInfoDriver from "./driver/file_info";
import DC_AreaDriver from "./driver/dc_area";

let driverList = [FileInfoDriver, DC_AreaDriver];

class Loader {
    driver_: FileInfoDriver | DC_AreaDriver | null;
    constructor() {
        this.driver_ = null;
    }
    load(reader: FileReader, finishCallback: FinishCallback, 
        progressCallback: ProgressCallback, errorCallback: ErrorCallback
    ) {
        
        let drivers = driverList.map((d) => new d());

        let loadLocal = (drivers: any) =>{
            // this.driver_ = new FileInfoDriver();
            this.driver_ = drivers.shift();
            if (this.driver_) {
                this.driver_.load(
                    reader, finishCallback, progressCallback, 
                    (errorMessage: string) => {
                        console.log(`${errorMessage}`);
                        console.log(`${this.driver_?.constructor.name} failed and try next driver`);
                        if(drivers.length > 0){
                            loadLocal(drivers);
                        }
                        else {
                            errorCallback("All drivers failed");
                        }
                    });
            }
        };

        loadLocal(drivers);
    }

    fileNodeToStr(fileNode: FileNode, isSizeMode: boolean) {
        return this.driver_ ? this.driver_.fileNodeToStr(fileNode, isSizeMode) : "";
    }
    
};

export { FileReader, Loader, FileNode };