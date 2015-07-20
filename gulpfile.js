const del = require('del');
const eslint = require('gulp-eslint');
const gulp = require('gulp');
const zip = require('gulp-zip');

gulp.task('build', ['lint', 'clean:dist'], function () {
  return gulp.src('src/*')
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
