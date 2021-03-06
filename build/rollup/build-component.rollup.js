const path = require('path')
const glob = require('glob')
const compiler = require('vueify').compiler
const bluebird = require('bluebird')
const fs = bluebird.promisifyAll(require('fs'))
const copy = require('recursive-copy')
const stylus = require('stylus')
const babel = bluebird.promisifyAll(require('babel-core'))
const TARGET_LIB_BASE = 'lib'
const SRC_BASE = 'components'


function babelPluginInsertCssImportForVue ({ types: t }) {
  function computedSameDirCssPosition(filePath) {
    const filePathParse = path.parse(filePath)
    return `./style/${filePathParse.name}.css`
  }
  return {
    visitor: {
      Program(path, state) {
        const importLiteral = computedSameDirCssPosition(state.opts.filePath)
        path.unshiftContainer('body', t.ImportDeclaration([],t.StringLiteral(importLiteral)))
      }
    }
  }
}

function compileVueStylus (content, cb, compiler, filePath) {
  stylus(content)
    .set('filename', filePath)
    .define('url', stylus.url())
    // .include(path.join(__dirname, 'src/*'))
    .import(path.join(__dirname, '../../components/_style/mixin/*.styl'))
    .import(path.join(__dirname, '../../node_modules/nib/lib/nib/vendor'))
    .import(path.join(__dirname, '../../node_modules/nib/lib/nib/gradients'))
    .import(path.join(__dirname, '../../node_modules/nib/lib/nib/flex'))
    .render((err, css) => {
      if (err) {
        throw err
      }
      cb(null, css)
    })
}

function computedCompilerConfig(filePath) {
  return {
    extractCSS: true,
    babel: {
      presets: [
        ['env', {
          'modules': 'umd',
          'targets': {
            'browsers': ['iOS >= 8', 'Android >= 4']
          }
        }],
      ],
      plugins: [
        [babelPluginInsertCssImportForVue, {
          filePath,
        }]
      ]
    },
    customCompilers: {
      stylus: compileVueStylus
    }
  }
}

function move(destDir) {
  return new Promise((resolve, reject) => {
    copy(SRC_BASE, destDir, {filter: function(item) {
      if (/demo|test/.test(item)) {
        return false
      }
      return true
    }}, function (err, result) {
      if (err) {
        reject(err)
      }
      resolve(result)
    })
  })
}

function compileVueAndReplace(filePath) {
  const styleDir = path.join(path.dirname(filePath), 'style')
  if (!fs.existsSync(styleDir)) {
    fs.mkdirSync(styleDir)
  }
  const fileBaseName = path.basename(filePath, '.vue')
  const cssFilePath = path.join(styleDir, `${fileBaseName}.css`)
  const jsFilePath = filePath.replace(/\.vue$/, '.js')
  console.info(cssFilePath, jsFilePath)
  const fileContent = fs.readFileSync(filePath, {
    encoding: 'utf8',
  })
  const config = computedCompilerConfig(filePath)
  compiler.applyConfig(config)
  let styleContent = ''
  const styleCb = res => {
    if (res.style) {
      styleContent = res.style
    }
  }
  compiler.on('style', styleCb)
  return new Promise((resolve, reject) => {
    compiler.compile(fileContent, filePath, (err, result) => {
      if (err) {
        reject(err)
      }
      compiler.removeListener('style', styleCb)
      fs.writeFileAsync(jsFilePath, result)
      .then(() => fs.writeFileAsync(cssFilePath, styleContent))
      .then(() => {
        return fs.unlinkAsync(filePath)
      })
    })
  })
}

function compileJsAndReplace(filePath){
   babel.transformFileAsync(filePath)
    .then(({code}) => {
      return fs.writeFileAsync(filePath, code)
    })
    .catch(error => {
      console.info(`${filePath} build error::error.stack=${error.stack}`)
    })
}

function compileAndReplaceAllJsFile() {
  const fileGlob = `${TARGET_LIB_BASE}/**/*.js`
  const jsFiles = glob.sync(fileGlob)
  return Promise.all(jsFiles.map(compileJsAndReplace))
    .catch(e => {
      console.info(e)
    })
}

function compileAndReplaceAllVueFile() {
  const fileGlob = `${TARGET_LIB_BASE}/**/*.vue`
  const jsFiles = glob.sync(fileGlob)
  return Promise.all(jsFiles.map(compileVueAndReplace))
    .catch(e => {
      console.info(e)
    })
}


function main() {
  return move('lib')
    .then(() => Promise.all([compileAndReplaceAllJsFile(), compileAndReplaceAllVueFile()]))
    .catch(e => console.info(e))
}

main()