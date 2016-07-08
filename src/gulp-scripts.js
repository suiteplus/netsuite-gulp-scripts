/* eslint-env es6, node */
var through = require('through2');

function toArray( inp ) {
    if (Array.isArray(inp)) return inp;
    return [inp];
}


exports.package = packg;
function packg(opt) {
    opt = opt || {};
    var browserify = require('browserify');
    var path = require('path');

    return through.obj( function( chunk, enc, callback ){
        var package_name = path.parse(chunk.path).name;
        console.log( package_name );
        var b = browserify( chunk.path )
            .require(chunk.path, { expose : package_name } );
        if (opt.external) {
            toArray(opt.external).forEach( item => {
                b = b.external( item );
            });
        }
        if (opt.es6) {
            b = b.transform('babelify' , { presets : ['es2015']})
        }
        chunk.contents = b.bundle();
        this.push(chunk);
        callback();
    })
}


exports.addGlobals = addGlobals;
function addGlobals() {
    var path = require('path');

    return through.obj(function(chunk,enc,callback) {
        var name = path.parse(chunk.path).name;
        var nameFixed = name.replace(/\-/g,'_');
        var prepend = `\n//mod ${name}\nvar GLOBALS = this;\n`;
        var append = `\nGLOBALS['${nameFixed}'] = require('${name}');\n`;

        var that = this;
        unstream(chunk.contents, content => {
            var out = prepend + content + append;
            chunk.contents = new Buffer(out);
            that.push(chunk);
            callback();
        });
    });
}


exports.addRev = addRev;
function addRev() {
    var q = require('q');
    var git_rev = require('git-rev');
    var plong = q.defer();
    var ptag = q.defer();
    var all = q.all([plong.promise,ptag.promise]);

    git_rev.long( _long => plong.resolve(_long) );
    git_rev.tag( _tag => ptag.resolve(_tag) );

    var all2 = all.then( res => `//commit ${res[0]}\n//tag ${res[2]}\n//${new Date().toISOString()}\nrequire = undefined;\n` );

    return through.obj(function(chunk,enc,callback) {
        all2.then( prepend => {
            var out = prepend + chunk.contents.toString();
            chunk.contents = new Buffer(out);
            this.push(chunk);
            callback();
        });

    });
}


exports.concatGlobals = concatGlobals;
function concatGlobals(path, addExports, mapping) {

    'use strict';
    var mapping = mapping || {};
    var glob = require('glob');
    var _ = require('lodash');
    var fs = require('fs');

    //string[]
    function findVars(content, key) {
        key = key || 'global'
        content = content.substr(0,1000);
        var out = (content.match(new RegExp(`^\\/\\*(\\s*)${key}.*\\*\\/`,'gm'))||[])
            .map( item => {
                let line = item
                    .replace(new RegExp(`^\\/\\*(\\s*)${key}`,'g'),'')
                    .replace(/\*\//g,'')
                let vars = line.split(',').map( i => i.trim() )
                return vars;
            }).reduce( (bef,curr) => {
                bef = bef.concat(curr);
                return bef;
            } , [] );
        console.log('vars ', out, key)
        return out
    }

    function recursive(varsObj, newVars) {
        (newVars||[]).forEach( newv => {
            if (!varsObj[newv]) varsObj[newv] = null
        })
        _(varsObj).keys().forEach( v => {
            if (varsObj[v]) return;
            if (mapping[v] === false) return;
            var filename = mapping[v] || v + '.js';
            var findstr;
            if (filename.charAt(0) != '.') findstr = `${path}/**/${filename}`;
            else findstr = filename;
            console.log('find ',findstr)
            let files = glob.sync(findstr,{ ignore : './node_modules/**'});
            if (!files.length) throw Error('Referência ' + v + ' não encontrada.');
            if (files.length > 1 && filename.charAt(0) != '.')
                throw Error('Mais de uma referência a ' + v + ' encontrada');
            var content = files.reduce( (bef, curr) => { 
                return bef + fs.readFileSync(curr, 'utf8')
            } , '')
            varsObj[v] = content;
            var vs = findVars(content);
            recursive(varsObj, vs);
        })
    }

    return through.obj( function(chunk, enc, callback) {
        var content = chunk.contents.toString();
        if (addExports) {
            let exps = findVars(content, 'exported');
            exps.forEach( exp => {
                content += `\nexports.${exp} = ${exp};`;
            })
        }
        console.log('chunk', chunk.path)
        var vs = findVars(content);
        var mappin = {};
        for (var it in vs) mappin[vs[it]] = null;
        recursive(mappin);
        for ( var it in mappin ) {
            content = mappin[it] + '\n//' + it + '\n\n' + content;
        }
        chunk.contents = new Buffer(content);
        callback(null,chunk);
    });

}


// ---- //


exports.runTest = function( opts ) {
    if (!opts.localPath) throw Error('localPath is mandatory!');
    if (!opts.destPath) throw Error('destPath is mandatory!');

    var gulp = require('gulp')
    var istanbul = require('istanbul')
    var nscabinet = require('nscabinet')
    var callRestlet = require('call-restlet')
    var nsconfig = require('nsconfig')
    var rename = require('gulp-rename')
    var fs = require('fs')

    return new Promise( (resolve, reject) => {

        var strm = gulp.src(opts.localPath)
            .pipe(packg({ external : 'test-bundle' }))
            .pipe(addGlobals())
            .pipe(through.obj(function each(chunk, enc, cb){
                if (chunk.isDirectory()) return cb(null,chunk);
                if (opts.addAuthstring) {
                    let params = nsconfig()
                    let nlauthRolePortion = ( params.role ) ? `,nlauth_role=${params.role}` : '';
                    let authstr = `NLAuth nlauth_account=${params.account},nlauth_email=${params.email},nlauth_signature=${params.password}${nlauthRolePortion}`
                    chunk.contents = new Buffer( String(chunk.contents) + 
                        '\nGLOBALS.AUTH_HEADER = "' + authstr + '";\nGLOBALS.NS_REALM = "' + params.realm + '";' )
                }
                if (opts.noCoverage) return cb(null, chunk);
                //sem o embedSource = true temos problemas na geração do relatório
                var istrumenter = new istanbul.Instrumenter({ embedSource : true });
                chunk.contents = new Buffer(istrumenter.instrumentSync( String(chunk.contents) ));
                cb(null, chunk);
            }))
        if (opts.destFilename) strm = strm.pipe(rename(opts.destFilename))
        strm = strm.pipe(nscabinet({ rootPath : opts.destPath, flatten : true , es6 : true }) )
            .pipe(rename('generated.js'))
            .pipe(gulp.dest('.gscripts'))
            .on('finish' , () => {
                if (!opts.scriptId) reject(Error('scriptid is mandatory!'));
                callRestlet( opts.scriptId, { 1 : 1 } )
                    .then( resp => {
                        console.log(resp.text)
                        if (opts.noCoverage) return;
                        if (resp.write) {
                            for ( var it in resp.write ) {
                                fs.writeFileSync('./.gscripts/' + it, resp.write[it]);
                            }
                        }
                        var collector = new istanbul.Collector()
                        var reporter = new istanbul.Reporter()
                        collector.add(resp.coverage)
                        reporter.add('text');
                        reporter.addAll(['lcov'])
                        reporter.write(collector, true, () => {
                            console.log('Done.')
                        });
                        resolve();
                    }).catch( err => {
                    reject(err);
                });
            })

        return strm

    })

}


function unstream(stream, cb) {
    var data = '';
    stream.on('data' , function(c) {
        data += c;
    })
    stream.on('end', function(){
        cb(data);
    });
}