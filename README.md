```bash
# Initialize node modules
make init

# Build the project
# If the build finishes successfully, dist/index.html will be generated.
make


# Build a Docker environment
make docker-build

# Enter the Docker environment
make docker-run

# Alternatively, after setting up the Docker environment
./docker/run.sh make

```


Copyright (C) 2016-2024 Ryota Shioya <shioya@ci.i.u-tokyo.ac.jp>

This application is released under the 3-Clause BSD License, see LICENSE.md.
This application bundles ELECTRON and many third-party packages in accordance with the licenses presented in THIRD-PARTY-LICENSES.md.

