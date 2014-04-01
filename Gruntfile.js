'use strict';
module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jshint: {
      options: {
        jshintrc: '.jshintrc',
        reporter: require('jshint-stylish')
      },
      all: [
        'Gruntfile.js',
        './dev/{,*/}*.js'
      ]
    },
  });
  grunt.loadNpmTasks('grunt-contrib-jshint');
};