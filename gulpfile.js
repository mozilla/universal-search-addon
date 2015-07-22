const del = require('del');
const eslint = require('gulp-eslint');
const gulp = require('gulp');
const template = require('gulp-template');
const zip = require('gulp-zip');

const pkgVersion = require('./package.json').version;

// Delete everything in the `dist/*` directory.
gulp.task('clean:dist', function (callback) {
  del(['dist'], callback);
});

// Copy the `src/*.rdf` files to `dist/*.rdf` for easier deployment.
gulp.task('copy:rdf', ['generate:rdf'], function () {
  return gulp.src('src/*.rdf')
    .pipe(gulp.dest('dist'));
});

// Run ESLint against all the *.js files.
gulp.task('eslint', function () {
  return gulp.src('{,src/**/,test/**/}*.js')
    .pipe(eslint())
    .pipe(eslint.failOnError());
});

// Generate the `src/install.rdf` and `src/update.rdf` files from the templates.
gulp.task('generate:rdf', function () {
  return gulp.src('templates/*.rdf')
    .pipe(template({version: pkgVersion}))
    .pipe(gulp.dest('src'));
});

// Generate the `dist/addon.xpi` file from the files in `src/**`.
gulp.task('generate:xpi', function () {
  return gulp.src('src/**')
    .pipe(zip('addon.xpi'))
    .pipe(gulp.dest('dist'));
});

gulp.task('build', ['lint', 'clean:dist', 'copy:rdf', 'generate:xpi']);

gulp.task('lint', ['eslint']);

gulp.task('default', ['build']);
