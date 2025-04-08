import FileInfoDriver from "./driver/file_info";
import DC_AreaDriver from "./driver/dc_area";
import VivadoAreaDriver from "./driver/vivado_area";
import GenusAreaFlatpathDriver from "./driver/genus_area_flatpath";
import GenusAreaHierpathDriver from "./driver/genus_area_hierpath";

let driverList = [FileInfoDriver, DC_AreaDriver, VivadoAreaDriver, GenusAreaFlatpathDriver, GenusAreaHierpathDriver];


import { FileReader, FileNode, FinishCallback, ProgressCallback, ErrorCallback} from "./driver/driver";

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
                let newReader = reader.clone();
                this.driver_.load(
                    newReader, 
                    (fileNode: FileNode|null) => {
                        console.log(`${this.driver_?.constructor.name} successfully loaded the input.`);
                        finishCallback(fileNode);
                    }, 
                    progressCallback, 
                    (errorMessage: string) => {
                        newReader.cancel();
                        console.log(`${this.driver_?.constructor.name} failed and try a next driver. ${errorMessage}`);
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