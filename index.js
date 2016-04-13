"use strict";

const glob = require("glob");
const path = require("path");
const mv = require('mv');
const rimraf = require('rimraf');
const fs = require('fs');
const chalk = require('chalk');

const libsWorkingDir = process.cwd();
const requireMappings = {};

// Generate mappings for all logical .js files in this working dir
glob.sync(libsWorkingDir + '/**/*.js').map(srcPath => {
	requireMappings[srcPath.replace(libsWorkingDir + '/', '').replace('.js', '')] = '';
});

console.log(requireMappings);
return;
// Now we go through each package and re-structure the package
// we also go through each src file and re-map the require path if needed
fs.readdirSync(libsWorkingDir).map(workingDir => new Promise((resolve, reject) => {
	if (!fs.lstatSync(workingDir).isDirectory()) {
		return;
	}
	const sourceFiles = glob.sync(workingDir + '/src/**/*.js');
	const basePath = getBasePath(sourceFiles);

	Promise.all([
		new Promise((resolve, reject) => 
			mv(workingDir + '/resources', workingDir + '/_resources', { mkdirp: true }, err => resolve(err))),
		new Promise((resolve, reject) => 
			mv(workingDir + '/test-unit/resources', workingDir + '/_test-resources', { mkdirp: true }, err => resolve(err))),
		new Promise((resolve, reject) => 
			mv(workingDir + '/test-unit/tests', workingDir + '/_tests', { mkdirp: true }, err => resolve(err)))
	]).then(err => {
		Promise.all(sourceFiles.map(filePath => new Promise((resolve, reject) => {
			const fileName = path.basename(filePath, '.js');
			const subDirectory = path.dirname(filePath).replace(basePath, '');
			const moveToPath = workingDir + subDirectory + '/' + fileName + '.js';

			// move src/somename/**/*.js -> ./**/*.js
			mv(filePath, moveToPath, { mkdirp: true }, err => {
				const testFile = workingDir + '/_tests' + subDirectory + '/' + fileName + 'Test.js';
				const moveToPath = workingDir + subDirectory + '/_tests/' + fileName + '.js';

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
			rimraf(workingDir + '/src', function() {});
			rimraf(workingDir + '/test-unit', function() {});
			rimraf(workingDir + '/compiled', function() {});
			rimraf(workingDir + '/br-lib.conf', function() {});

			console.log(chalk.green(`Completed ${ workingDir }!`));
		}).catch(err => {
			console.log(err);
		});
	}).catch(err => {
		console.log(err);
	});
}));

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
