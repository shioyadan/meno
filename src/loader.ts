import FileInfoDriver from "./driver/file_info";
import DC_AreaDriver from "./driver/dc_area";
import VivadoAreaDriver from "./driver/vivado_area";
import GenusAreaFlatpathDriver from "./driver/genus_area_flatpath";
import GenusAreaHierpathDriver from "./driver/genus_area_hierpath";
import PrimeTimePowerDriver from "./driver/prime_time_power";
import GenusPowerTotalDriver from "./driver/genus_power";

let driverList = [FileInfoDriver, DC_AreaDriver, VivadoAreaDriver, GenusAreaFlatpathDriver, GenusAreaHierpathDriver, PrimeTimePowerDriver, GenusPowerTotalDriver];


import { FileReader, DataNode, FinishCallback, ProgressCallback, ErrorCallback} from "./driver/driver";

class Loader {
    driver_: FileInfoDriver | DC_AreaDriver | null;
    loadId_ = 0;
    activeReader_: FileReader | null = null;
    constructor() {
        this.driver_ = null;
    }

    cancel(onCanceled?: () => void) {
        this.loadId_++;
        const activeReader = this.activeReader_;
        this.activeReader_ = null;
        if (activeReader) {
            activeReader.cancel(onCanceled);
        } else {
            onCanceled?.();
        }
    }

    load(reader: FileReader, finishCallback: FinishCallback,
        progressCallback: ProgressCallback, errorCallback: ErrorCallback
    ) {

        const loadId = ++this.loadId_;
        const isCurrentLoad = () => loadId === this.loadId_;
        const isActive = () => isCurrentLoad() && !reader.isCanceled();
        let drivers = driverList.map((d) => new d());

        let loadLocal = (drivers: any) =>{
            if (!isActive()) return;
            // this.driver_ = new FileInfoDriver();
            this.driver_ = drivers.shift();
            if (this.driver_) {
                let newReader = reader.clone();
                this.activeReader_ = newReader;
                newReader.onError((error) => {
                    if (!isCurrentLoad()) return;
                    this.activeReader_ = null;
                    console.log(`${this.driver_?.constructor.name} failed while reading the input. ${error}`);
                    errorCallback("Failed to read input");
                });
                this.driver_.load(
                    newReader,
                    (fileNode: DataNode|null) => {
                        if (!isActive()) return;
                        this.activeReader_ = null;
                        console.log(`${this.driver_?.constructor.name} successfully loaded the input.`);
                        finishCallback(fileNode);
                    },
                    (message: string) => {
                        if (!isActive()) return;
                        progressCallback(message, newReader.getProgress());
                    },
                    (errorMessage: string) => {
                        newReader.cancel(() => {
                            if (!isActive()) return;
                            if (this.activeReader_ === newReader) {
                                this.activeReader_ = null;
                            }
                            console.log(`${this.driver_?.constructor.name} failed and try a next driver. ${errorMessage}`);
                            if(drivers.length > 0){
                                loadLocal(drivers);
                            }
                            else {
                                this.activeReader_ = null;
                                errorCallback("All drivers failed");
                            }
                        });
                    });
            }
        };

        loadLocal(drivers);
    }

    fileNodeToStr(fileNode: DataNode, rootNode: DataNode, dataIndex: number, detailed: boolean) {
        return this.driver_ ? this.driver_.fileNodeToStr(fileNode, rootNode, dataIndex, detailed) : "";
    }

    itemNames() {
        return this.driver_ ? this.driver_.itemNames() : [];
    }

};

export { FileReader, Loader, DataNode };
