.PHONY: build clean pack publish test typecheck

build: node_modules
	rm -rf dist
	yarn tsc

clean:
	rm -rf dist

pack: build test
	yarn pack
	tar tzf *.tgz

test: build
	node --test 'dist/**/*.test.js'

typecheck: node_modules
	yarn tsc --noEmit

node_modules: package.json yarn.lock
	yarn install
	touch node_modules
