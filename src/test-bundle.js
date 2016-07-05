/* eslint-env es6 */

var chai = require('chai');
require('netsuite-console-log')
module.exports.chai = chai;


var _tests = [];


module.exports.Tester = Tester;
function Tester() {
    return Object.create(_TesterProto);
}


var _TesterProto = {
    test : function( name, fn ) {
        _tests.push({
            name : name ,
            fn : fn
        })
        return this;
    } ,
    notest : function( fn ) {
        _tests.push({
            silent : true ,
            fn : fn
        })
        return this;
    } ,
    run : function() {

        //era um suitelet. por hora enviar texto cru
        var out = '';
        function w(txt) {
            nlapiLogExecution('ERROR','teste',txt)
            out += txt
        }

        var toWrite = null;
        module.exports.write = function( file, content ) {
            toWrite = toWrite || {};
            if (typeof content == 'object') toWrite[file] = JSON.stringify(content);
            else toWrite[file] = content;
        }

        oldConsoleLog = console.log;
        console.log = function(...obj) {
            w('\n     LOG: ' + oldConsoleLog(...obj));
        }

        var failed = false;
        _tests.forEach(function(item) {
            if (failed) return;
            w(' - ' + item.name);
            try {
                item.fn();
            } catch(e) {
                var estr;
                if (e && e.toString) {
                    estr = e.toString();
                    estr = estr.replace(/\n/g,'\n     ')
                } else {
                    estr = e;
                }
                var stack = console.$stackTrace(e)
                    .replace(/ -- /g, '\n     ');
                if (stack) estr += '\n     STACK:\n     ' + stack;
                w('\n     Error.' + estr + '\n' );
                failed = true;
            }
            if (!failed) w(': ok.\n')
        });


        return { coverage : GLOBALS.__coverage__ , text : out , write : toWrite } ;

    }
};