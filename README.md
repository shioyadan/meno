# Meno

Meno is a tool for visualizing hierarchical data, such as directory tree sizes or synthesized circuit sizes. It can be built into a single, standalone HTML file.

Supported tools and formats:

- Vivado: hierarchical area reports
- Genus: hierarchical area and power reports
- Design Compiler (DC): hierarchical area reports
- PrimeTime: hierarchical power reports
- Joules: hierarchical power reports and category summaries
- Yosys: JSON netlists produced by `write_json`

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
* With Bash and Python 3 installed, use `meno.sh` to embed a report or view it through a local server:
    ```bash
    # Generate an HTML file (your_area_report.txt.html) in the same directory.
    ./meno.sh --embed your_area_report.txt

    # Serve Meno with the report loaded at the printed URL.
    ./meno.sh your_area_report.txt
    ```

### Shell Launcher (Linux / WSL)

Download and extract [meno-latest.zip](https://shioyadan.github.io/meno/meno-latest.zip), then run `meno.sh` with Bash and Python 3 installed:

```bash
# Serve Meno and open the specified report automatically at the printed URL.
./meno.sh path/to/report.txt
./meno.sh path/to/report.txt.zst

# Show help (also available with --help).
./meno.sh

# Serve Meno without an initial file, or choose a fixed port.
./meno.sh --serve
MENO_PORT=30080 ./meno.sh path/to/report.txt

# Generate a standalone HTML file with an uncompressed UTF-8 report embedded.
./meno.sh --embed path/to/report.txt          # Creates path/to/report.txt.html
./meno.sh --embed path/to/report.txt out.html # Choose the output path

# Check and install the latest development build after confirmation.
./meno.sh --update
```

The server listens on `127.0.0.1` and serves only Meno and the specified input file. Files are streamed into the browser, including `.zst` / `.zstd` input. For a remote machine, run the printed `ssh -L ... <host>` command on your local machine and open the printed URL locally. Stop the server with Ctrl+C.

With `--embed`, the generated HTML can be opened directly in a browser without a server or the original report. Existing output files are replaced after successful generation. The input file and Meno's `index.html` cannot be used as the output path. In a source checkout, run `make production` first.

Updates show the installed and available commit and date, list changed files, and ask before replacing `meno.sh` and `index.html`. The update channel follows tested `main` builds, including changes newer than tagged releases. `MENO_UPDATE_URL` can select another compatible archive. Self-update is available in extracted distributions; for a source checkout, update with Git and rebuild with `make production`.

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

# Check types, launcher behavior, input streaming, search, and synthesis reports
make typecheck test

# Run the launcher from a source checkout after make production
./meno.sh path/to/report.txt

# Test and build the self-update distribution (meno-latest.zip)
make latest-archive

# Launch the development server
make serve

# Build a Docker environment
make docker-build

# Enter the Docker environment
make docker-run

# Alternatively, after setting up the Docker environment, you can launch 'make' or other commands directly.
./docker/run.sh make
```

See [synthesis checks and test data](test/synthesis/README.md) for tool setup,
report formats, and fixtures.

## License

Copyright (C) 2016-2026 Ryota Shioya <shioya@ci.i.u-tokyo.ac.jp>

This application is released under the 3-Clause BSD License, see LICENSE.md. This application bundles third-party packages in accordance with the licenses presented in THIRD-PARTY-LICENSES.md.
