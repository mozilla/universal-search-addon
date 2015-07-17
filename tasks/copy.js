module.exports = function (grunt) {
  grunt.loadNpmTasks('grunt-contrib-copy');

  grunt.config('copy', {
    rdf: {
      files: [
        {
          src: 'src/*.rdf',
          dest: 'dist',
          expand: true,
          flatten: true
        }
      ]
    }
  });
};
