import YosysDriver from "./driver/yosys";
import FileInfoDriver from "./driver/file_info";
import DC_AreaDriver from "./driver/dc_area";
import VivadoAreaDriver from "./driver/vivado_area";
import GenusAreaDriver from "./driver/genus_area";
import PrimeTimePowerDriver from "./driver/prime_time_power";
import GenusPowerDriver from "./driver/genus_power";
import JoulesPowerCategoryDriver from "./driver/joules_power_category";

let driverList = [FileInfoDriver, DC_AreaDriver, YosysDriver, VivadoAreaDriver, GenusAreaDriver, PrimeTimePowerDriver, GenusPowerDriver, JoulesPowerCategoryDriver];


import { FileReader, DataNode, FinishCallback, ProgressCallback, ErrorCallback} from "./driver/driver";

class Loader {
    driver_: InstanceType<(typeof driverList)[number]> | null;
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

        let loadLocal = (drivers: InstanceType<(typeof driverList)[number]>[]) =>{
            if (!isActive()) return;
            this.driver_ = drivers.shift() ?? null;
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
                    (errorMessage: string, recognized = false) => {
                        newReader.cancel(() => {
                            if (!isActive()) return;
                            if (this.activeReader_ === newReader) {
                                this.activeReader_ = null;
                            }
                            if (recognized) {
                                console.log(`Invalid report: ${errorMessage}`);
                                errorCallback(errorMessage);
                            }
                            else if(drivers.length > 0){
                                console.log(`${this.driver_?.constructor.name} did not recognize the input. Trying the next driver.`);
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
