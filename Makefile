zip:
	npm run compile
	zip -r function.zip package.json .env dist/index.js 
