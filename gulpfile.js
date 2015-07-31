const del = require('del');
const eslint = require('gulp-eslint');
const gulp = require('gulp');
const zip = require('gulp-zip');
const fs = require('fs');

gulp.task('build', ['lint', 'clean:dist'], function () {
  return gulp.src('src/**')
    .pipe(zip('addon.xpi'))
    .pipe(gulp.dest('dist'));
});

gulp.task('clean:dist', function (callback) {
  del(['dist'], callback);
});

gulp.task('eslint', function () {
  return gulp.src('{,src/**/,test/**/}*.js')
    .pipe(eslint())
    .pipe(eslint.failOnError());
});

gulp.task('lint', ['eslint']);

gulp.task('default', ['lint']);

gulp.task('gen-prefs', function(cb){
  var contents = '// Set prefs to use a local content server\n'; // eslint-disable-line
  contents += 'user_pref("services.universalSearch.frameURL", "https://localhost:8080/index.html");\n';
  contents += 'user_pref("services.universalSearch.baseURL", "https://localhost:8080/");\n';
  contents += '\n// Set prefs using remote content server\n';
  contents += '//user_pref("services.universalSearch.frameURL", "https://d1fnkpeapwua2i.cloudfront.net/index.html");\n';
  contents += '//user_pref("services.universalSearch.baseURL", "https://d1fnkpeapwua2i.cloudfront.net/");\n';
  fs.writeFile('users.js', contents, cb);
});
