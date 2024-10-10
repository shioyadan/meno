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
