# netsuite gulp scripts

Common project build scripts/tools

package([opts])
---

Shorthand for browserify packaging.

```javascript
var gscripts = require('gulp-scripts')

gulp.src('./src/*.js')
    .pipe(gscripts.package())
    .pipe(gscripts.addGlobals())
    .pipe(gscripts.addRev())
    .pipe('dist')
```

**Options**

 - _external: string | string[]_: Executes `Bundle:external()` from browserify.
   Tells browserify not to bundle the specified package names (so you may further include them
   from another file).

- _es6: boolean_: Applies Babel transform to shim es6 into es5.

addGlobals
---

After the bundling, requires the generated package and exposes it as the file name.
`snake-case` file name is converted into `camelCase` global variable name.

Inside the modules, the global scope is exposed as the valiable `GLOBALS`.

**Example**

```javascript
//file-1.js
exports.number = 3;
```

```javascript
//node_modules/mypackage/index.js
exports = 5;
```

```javascript
//file-2.js
var dependency = require('./file-1.js');
var myPackage= require('mypackage');

exports = function Output() {
    GLOBALS.document.title = 'Title';
    console.log(dependency.number);
    console.log(myPackage);
}
```

Generates a file named `dist/file-2.js`. Declares on this a global named
`file-2` which equals `Output()`.


concatGlobals(rootPath : string , addExports : boolean, fileMapping? : {})
-------------------------------

Assuming the following project structure:

  - Each file exposes a global variable with the same name as the file name. Each file name is unique;
  - Each file's dependencies are specified using eslint's `/* global */` tag at the start of the script;

Given a "root" script file, concatenates all of its dependencies into a single file.

If "addExports == true", includes `exports.<name> = <name>`, where `name` is the "root" file/module name.

With the fileMapping object you may specify a different file name to lookup
for some module, or to ignore a module (setting the value to false). Ex:

```javascript
var mapping = {
  moduleName1 : 'module.js' //looks for **/module.js
  moduleName2 : './path1/**/module2.js' //searches this glob, concats all the files found
}
```

Test tools
---

**runTest({ localPath , destPath, destFilename? , scriptId , noCoverage? }) : Promise**

Test netsuite server scripts (mostly restlets)
 
- Write your test in _localPath_ using the provided tool (below); Export the function `Tester::run`;

- Set up nscabinet for file upload (nsconfig.json + script)

- Create the gulp task without the script id; Run it once so the file is uploaded (the script will
then fail);

- Create a RESTlet, using as script file the recently uploaded file;
  Add `dist/test-bundle.js` from this repo as library;
  Add the exported `Tester#run()` function as POST function;

- Fill up the generated RESTlet id in the gulpfile. Run again.
  
**Testing lib**

 -  Use `require('test-bundle')` in the test script;
 
 - `test_bundle.chai` exposes chai lib;
 
 - `test_bundle.Tester() : Tester` exposes the way to define your tests;
 
 - `test_bundle.write(filename, contents)` writes custom debugging content into your local
   path after the script is run.

 - `console.log` outputs into your local console afer the test is run

 - `console.$stackTrace(err)` gets a stack trace from a JS error object or a nlobjError 
   
```javascript
interface Tester {
  //runs a code block, prints a success indicator
  test : ( description , function ) => Tester
  //runs a code block silently
  notest : ( function ) => Tester
  //export me
  run : () => { coverage : any , text : string }
}
```
 
Test code sample:
 
```javascript
var tbundle = require('test-bundle');
var chai = tbundle.chai;
var my_module = require('../dist/meu-modulo.js');
 
var t = tbundle.Tester().test('Test 1' , function() {
     
    chai.expect(my_module.one).is.equal(1);
     
}).notest( function() {
  
    setupSomeData();
     
})

module.exports = t.run
```
 
Returns to your console:
 
```
  - Test 1: OK
  (dados de cobertura)
```
... and saves a coverage report locally.

**What happens there?**

 - The test is packaged and instrumented
 
 - Sent to netsuite, replacing the former script file
 
 - The restet is called, returning the logs and istanbul coverage object
 
 - Coverage report generated
 
OBS: Because `tbundle` is externally included, it isn't shown in the coverage.


**noCoverage = true**

No coverage, for faster execution and to allow debugging.

**gulp sample**

```javascript
runTest({
    localPath : 'test/test.js' ,
    destPath : '/SuiteScripts/tests/' ,
    scriptId : 99
}).then( () => console.log('TESTE OK'); );
```