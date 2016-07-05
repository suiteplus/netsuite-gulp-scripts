var gulp = require('gulp')
var gscripts = require('./src/gulp-scripts')

gulp.task('test-bundle' , () => {
   
   return gulp.src('src/test-bundle.js')
    .pipe(gscripts.package({ es6 : true }))
    .pipe(gscripts.addGlobals())
    .pipe(gulp.dest('dist'))
    
});