# Meno

Meno is a tool that visualizes hierarchical data, such as the sizes of directory trees or synthesized circuit sizes. It can be built into a single, standalone HTML file.

Currently, Meno supports hierarchical area reports from Vivado, Genus, and DC.

## How to Use

### Web Version
* Open [this link](https://shioyadan.github.io/meno/demo/) and drag and drop your area report file.
* The following is a demo using the synthesis results of the [RSD processor](https://github.com/rsd-devel/rsd):
    * [Vivado RSD Area](https://shioyadan.github.io/meno/demo/vivdao-rsd-lut.html)
    * [Design Compiler RSD Area](https://shioyadan.github.io/meno/demo/dc-rsd-area.html)

### Use in Your Local Environment
* Download and extract the pre-built files from [this link](https://github.com/shioyadan/meno/releases).
* Drag and drop an input file onto `index.html` to visualize it.
* You can create an HTML file with your input file embedded by passing the input file to `embed.sh`:
    ```bash
    ./embed your_area_report.txt
    ```

## Development

This project is designed for development using Node.js (version 18). If you encounter compatibility issues, it is recommended to use the following Docker environment.

```bash
# Initialize Node modules
make init

# Build the project
# If the build completes successfully, dist/index.html will be generated.
make production

# Build debug version
make 

# Launch the development server
make serve

# Build a Docker environment
make docker-build

# Enter the Docker environment
make docker-run

# Alternatively, after setting up the Docker environment, you can launch 'make' or other commands directly.
./docker/run.sh make
```

## License

Copyright (C) 2016-2024 Ryota Shioya <shioya@ci.i.u-tokyo.ac.jp>

This application is released under the 3-Clause BSD License, see LICENSE.md. This application bundles third-party packages in accordance with the licenses presented in THIRD-PARTY-LICENSES.md.

