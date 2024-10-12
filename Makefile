all:
	mkdir -p dist
	npx webpack

production:
	mkdir -p dist
	npx webpack --mode production

serve:
	npx webpack serve --open

init:
	npm install

clean:
	rm dist -f -r

docker-run:
	./docker/run.sh

docker-build:
	cd docker; make docker-build
