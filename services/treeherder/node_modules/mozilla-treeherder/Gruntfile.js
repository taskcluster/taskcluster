module.exports = function(grunt) {
  var docFiles = [
    'README.md',
    'github.js',
    'project.js',
    'factory/github.js'
  ];

  
  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    watch: {
      files: docFiles,
      tasks: ['jsdoc']
    },

    jsdoc : {
      dist : {
        dest: 'doc',
        jsdoc: './node_modules/jsdoc/jsdoc.js',
        src: docFiles,
        options: {
          private: false,
          template: './node_modules/ink-docstrap/template',
          configure: './jsdoc.json'
        }
      }
    }
  });

  // Default task(s).
  grunt.registerTask('default', ['jsdoc']);
  grunt.loadNpmTasks('grunt-jsdoc');
  grunt.loadNpmTasks('grunt-contrib-watch');
};
