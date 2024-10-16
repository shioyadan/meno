# Meno

Meno is a tool that visualizes hierarchical data, such as the sizes in directory trees or synthesized circuit sizes. It is capable of being built into a single, standalone HTML file.

Currently, Meno supports hierarchical area reports from Vivado, Genus, and DC.

## How to use

* Download and extract the pre-built files from https://github.com/shioyadan/meno/releases.
* Drag and drop an input file onto index.html to visualize it.
* You can create an HTML file with your input file embedded by passing the input file to embed.sh:
    ```bash
    ./embed your_area_report.txt
    ```

## Development

This project is specifically designed for development on Node.js (version 18).  In case of compatibility issues, the following Docker environment is recommended.

```bash
# Initialize Node modules
make init

# Build the project
# If the build finishes successfully, dist/index.html will be generated.
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

This application is released under the 3-Clause BSD License, see LICENSE.md.
This application bundles ELECTRON and many third-party packages in accordance with the licenses presented in THIRD-PARTY-LICENSES.md.

