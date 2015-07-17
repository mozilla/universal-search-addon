module.exports = function (grunt) {
  grunt.loadNpmTasks('grunt-eslint');

  grunt.config('eslint', {
    files: [
      '{,src/**/,test/}*.js'
    ]
  });
};