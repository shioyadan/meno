BUILD_ID := $(shell git show -s --format=%ct-%h-%cs HEAD)

all:
	mkdir -p dist
	npx webpack

typecheck:
	./node_modules/.bin/tsc --noEmit

test: launcher-check synthesis-check
	node test/search.test.cjs
	node test/file_reader.test.cjs

production: licenses
	mkdir -p dist
	npx webpack --mode production
	cp src/embed.sh dist/embed.sh
	cp src/launch_httpd.sh dist/launch_httpd.sh
	cp meno.sh LICENSE.md dist/
	sed -i 's/^build=0-source-unknown$$/build=$(BUILD_ID)/' dist/meno.sh
	cp ./THIRD-PARTY-LICENSES.md dist/THIRD-PARTY-LICENSES.md
	cp ./README.md dist/README.md
	chmod 755 dist/embed.sh dist/meno.sh

serve:
	npx webpack serve --open

init:
	npm install
	$(MAKE) licenses

licenses:
	node tools/license_notices.js

clean:
	rm dist -f -r

docker-run:
	./docker/run.sh

docker-build:
	cd docker; make docker-build

pack: production
	rm -f meno.zip
	cd dist; zip -r ../meno.zip .

launcher-check:
	bash -n meno.sh
	test -x meno.sh
	python3 test/launcher_test.py

latest-archive: typecheck test production
	rm -f meno-latest.zip
	mkdir -p dist/meno-latest
	cp dist/index.html dist/meno.sh dist/embed.sh dist/launch_httpd.sh dist/README.md dist/LICENSE.md dist/THIRD-PARTY-LICENSES.md dist/bundle.js.LICENSE.txt dist/meno-latest/
	cd dist; zip -qr ../meno-latest.zip meno-latest
	rm -r dist/meno-latest
	zip -T meno-latest.zip

embed:
	make production
	sed -i.bak -e '/^__MENO_INITIAL_LOADING_DATA_PLACE_HOLDER__/{r ./work/rsd-vidado-area.txt' -e 'd}' ./dist/index.html

build-demo: production
	cd demo; unzstd *.zst
	./meno.sh --embed demo/dc-rsd-area.log
	./meno.sh --embed demo/vivado-rsd-area.log

synthesis-check:
	python3 test/synthesis_runner_test.py
	node test/synthesis_reports.test.cjs

check-yosys:
	python3 test/synthesis/run.py yosys --check

synth-genus synth-dc synth-yosys:
	python3 test/synthesis/run.py $(patsubst synth-%,%,$@)

.PHONY: synthesis-check check-yosys synth-genus synth-dc synth-yosys all typecheck test production serve init licenses clean pack latest-archive launcher-check build-demo
