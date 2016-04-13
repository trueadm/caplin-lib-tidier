"use strict";

const glob = require("glob");
const path = require("path");
const mv = require('mv');
const rimraf = require('rimraf');
const fs = require('fs');
const chalk = require('chalk');

const rootDir = process.cwd();
const libsWorkingDir = rootDir + '/packages';
const jsRequireMappings = Object.create(null);

if (rootDir.indexOf('packages') > -1) {
	console.log(chalk.red('You are in the "packages" directory, you should be in the root directory for all apps'));
	return;
}
if (rootDir.indexOf('apps') > -1) {
	console.log(chalk.red('You are in the "apps" directory, you should be in the root directory for all apps'));
	return;
}

// Generate mappings for all logical .js files in this working dir
glob.sync(libsWorkingDir + '/**/*.js').forEach(srcPath => {
	// remove initial prefix path /foo/
	if (srcPath.indexOf('test-unit') === -1) {
		const packagePath = srcPath.replace(libsWorkingDir + '/', '').replace('.js', '');
		const mappingKey = packagePath.replace(packagePath.split('/')[0] + '/src/', '');
		jsRequireMappings[mappingKey] = null;
	}
});

// Now we go through each package and re-structure the package
// we also go through each src file and re-map the require path if needed
Promise.all(fs.readdirSync(libsWorkingDir).map(workingDir => new Promise((resolve, reject) => {
	const absolutePath = libsWorkingDir + '/' + workingDir;

	if (!fs.lstatSync(absolutePath).isDirectory()) {
		resolve();
		return;
	}
	const sourceFiles = glob.sync(absolutePath + '/src/**/*.js');
	const basePath = getBasePath(sourceFiles);

	Promise.all([
		new Promise((resolve, reject) => 
			mv(absolutePath + '/resources', absolutePath + '/_resources', { mkdirp: true }, err => resolve(err))),
		new Promise((resolve, reject) => 
			mv(absolutePath + '/test-unit/resources', absolutePath + '/_test-resources', { mkdirp: true }, err => resolve(err))),
		new Promise((resolve, reject) => 
			mv(absolutePath + '/test-unit/tests', absolutePath + '/_tests', { mkdirp: true }, err => resolve(err)))
	]).then(err => {
		Promise.all(sourceFiles.map(filePath => new Promise((resolve, reject) => {
			const fileName = path.basename(filePath, '.js');
			const subDirectory = path.dirname(filePath).replace(basePath, '');
			const mappingKey = filePath.replace(absolutePath + '/', '').replace('.js', '').replace('src/', '');
			const mappingValue = workingDir + subDirectory + '/' + fileName;
			const moveToPath = 'packages/' + mappingValue + '.js';

			console.log(moveToPath)

			jsRequireMappings[mappingKey] = mappingValue;

			// move src/somename/**/*.js -> ./**/*.js
			mv(filePath, moveToPath, { mkdirp: true }, err => {
				const testFile = absolutePath + '/_tests' + subDirectory + '/' + fileName + 'Test.js';
				const moveToPath = absolutePath + subDirectory + '/_tests/' + fileName + '.js';

				// move test-unit/tests/**/*.js -> ~tests/*.js
				if (fileExists(testFile)) {
					mv(testFile, moveToPath, { mkdirp: true }, err => {
						resolve();
					});
				} else {
					resolve();
				}
			});
		}))).then(done => {
			rimraf(absolutePath + '/src', function() {});
			rimraf(absolutePath + '/test-unit', function() {});
			rimraf(absolutePath + '/compiled', function() {});
			rimraf(absolutePath + '/br-lib.conf', function() {});

			console.log(chalk.green(`Converted "${ workingDir }"`));
			resolve();
		}).catch(err => {
			console.log(err);
			resolve();
		});
	}).catch(err => {
		console.log(err);
		resolve();
	});
}))).then(done => {
	// Go through every source file and update mappings to the new ones
	glob.sync(rootDir + '/**/*.js').forEach(srcPath => {
		if (srcPath.indexOf('test-unit') === -1 && srcPath.indexOf('node_modules') === -1) {
			let fileContents = fs.readFileSync(srcPath, 'utf8');
			const strings = fileContents.match(/(["'])(?:(?=(\\?))\2.)*?\1/g)

			if (strings) {
				let needsWrite = false;

				for (let i = 0; i < strings.length; i++) {
					const mapping = strings[i].replace(/'/g, '').replace(/"/g, '');
					const value = jsRequireMappings[mapping];

					if (value && mapping) {
						fileContents = fileContents.replace(new RegExp(mapping, 'g'), value);
						needsWrite = true;
					}
				}
				if (needsWrite) {
					fs.writeFileSync(srcPath, fileContents, 'utf8')
				}
			}
		}
	});
	console.log(chalk.blue(`\nConversion complete!`));
}).catch(err => {
	console.log(chalk.red(err + '\n'));
	console.log(chalk.red(`Failure!`));
});

function getBasePath(sourceFiles) {
	let firstDir = path.dirname(sourceFiles[0]);
	const lastDir = path.dirname(sourceFiles[sourceFiles.length - 1]);
	let attempts = 0;

	while (attempts < 3) {
		attempts++;
		if (lastDir.indexOf(firstDir) !== -1) {
			return firstDir;
		} else {
			firstDir = path.dirname(firstDir);
		}
	}
}

function fileExists(path) {
	try {
	    fs.accessSync(path, fs.F_OK);
	    return true;
	} catch (e) {
	    return false;
	}
	return false;
}
