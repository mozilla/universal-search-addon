module.exports = function (grunt) {
  grunt.registerTask('release', 'Create an addon.xpi file from the files in src/**.', [
    'lint',
    'clean:dist',
    'compress:src',
    'copy:rdf'
  ]);
};
