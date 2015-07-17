module.exports = function (grunt) {
  grunt.loadNpmTasks('grunt-contrib-compress');

  grunt.config('compress', {
    src: {
      options: {
        archive: 'dist/addon.xpi',
        mode: 'zip'
      },
      files: [
        {
          expand: true,
          cwd: 'src',
          src: ['**']
        }
      ]
    }
  });
};
