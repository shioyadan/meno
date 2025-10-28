# Meno

Meno is a tool for visualizing hierarchical data, such as directory tree sizes or synthesized circuit sizes. It can be built into a single, standalone HTML file.

Currently, Meno supports hierarchical area reports from Vivado, Genus, and DC, and hierarchical power reports from PrimeTime and Genus.

![demo](./demo/meno.gif)

## How to Use

### Web Version
* Open [this page](https://shioyadan.github.io/meno/) and drag-and-drop your area (or power) report file.
    * You can try the unstable build [here](https://shioyadan.github.io/meno/unstable).
* Demo using the synthesis results of the [RSD processor](https://github.com/rsd-devel/rsd):
    * [DEMO: Vivado RSD Area](https://shioyadan.github.io/meno/vivado-rsd-area.log.html)
    * [DEMO: Design Compiler RSD Area](https://shioyadan.github.io/meno/dc-rsd-area.log.html)


### Use in Your Local Environment
* Download and extract the pre-built files from [this link](https://github.com/shioyadan/meno/releases).
* Drag and drop an input file onto `index.html` to visualize it.
* To embed your input file into a standalone HTML, use `embed.sh`:
    ```bash
    # Generate an HTML file (your_area_report.txt.html) in the same directory.
    ./embed.sh your_area_report.txt

    # Launch a web server, which is useful to view the output HTML from a remote client. 
    ./launch_httpd.sh
    ```

## Development

This project is designed for development using Node.js (version 18) on Ubuntu 24.04. If you encounter compatibility issues, it is recommended to use the following Docker environment, which is based on an Ubuntu 24.04 image.

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

Copyright (C) 2016-2025 Ryota Shioya <shioya@ci.i.u-tokyo.ac.jp>

This application is released under the 3-Clause BSD License, see LICENSE.md. This application bundles third-party packages in accordance with the licenses presented in THIRD-PARTY-LICENSES.md.
