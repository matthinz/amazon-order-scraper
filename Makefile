.PHONY: test typecheck

test: typecheck
	node --test 'src/**/*.test.ts'

typecheck: node_modules
	yarn tsc --noEmit

node_modules: package.json yarn.lock
	yarn install
	touch node_modules