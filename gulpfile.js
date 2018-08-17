const gulp = require('gulp');
const imagemin = require('gulp-imagemin');
const csso = require('gulp-csso');
const gutil = require('gulp-util');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify');

const watchify = require('watchify');
const browserify = require('browserify');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const log = require('gulplog');
const sourcemaps = require('gulp-sourcemaps');
const assign = require('lodash.assign');
const ascjsify = require('ascjsify');

const gulpLoadPlugins = require("gulp-load-plugins");



const imgSrc = '../mws-restaurant-stage-1/img/*.jpg',
	imgDst = 'stageTwo/images',
	csssrc = '../mws-restaurant-stage-1/css/*.css',
	cssdest = 'stageTwo/css',
	jssrc = '../mws-restaurant-stage-1/js/*.js',
	jsdest = 'stageTwo/js';
gulp.task('imagemin', function () {
	gulp.src(imgSrc)
		.pipe(imagemin())
		.pipe(gulp.dest(imgDst));
});
gulp.task('development', function () {
	return gulp.src(csssrc)
		.pipe(csso({
			restructure: false,
			sourceMap: true,
			debug: true
		}))
		.pipe(gulp.dest(cssdest));
});
gulp.task('build-js', function () {
	return gulp.src(jssrc)
		.pipe(concat("jsmin.js"))
		.pipe(gulp.dest(jsdest));
});
gulp.task('watch', function () {
	gulp.watch(jsdest, ['build-js']);
});
/*===============================================================================================*/
var customOpts = {
	entries: ['./stageTwo/js/main.js',
			  
			  './stageTwo/register.js',
			  './stageTwo/sw.js'],
	debug: true
};
var opts = assign({}, watchify.args, customOpts);
var b = watchify(browserify(opts));

// add transformations here
// i.e. b.transform(coffeeify);
b.transform(ascjsify, { global: true });

gulp.task('js', bundle); // so you can run `gulp js` to build the file
b.on('update', bundle); // on any dep update, runs the bundler
b.on('log', log.info); // output build logs to terminal

function bundle() {
	return b.bundle()
		// log errors if they happen
		.on('error', log.error.bind(log, 'Browserify Error'))
		.pipe(source('bundle.js'))

		.pipe(gulp.dest('./stageTwo/js/dist/'));
}

gulp.task('default', ['imagemin', 'development', 'build-js', 'js']);
