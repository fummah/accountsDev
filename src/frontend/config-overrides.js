const path = require('path');
const {override, fixBabelImports, addLessLoader} = require('customize-cra')


const options = {
  stylesDir: path.join(__dirname, './src/styles'),
  antDir: path.join(__dirname, './node_modules/antd'),
  varFile: path.join(__dirname, './src/styles/variables.less'),
  mainLessFile: path.join(__dirname, './src/styles/wieldy.less'),
  themeVariables: [
    '@primary-color',
    '@secondary-color',
    '@text-color',
    '@heading-color',
    '@nav-dark-bg',
    '@header-text-color',
    '@layout-header-background',
    '@layout-footer-background',
    '@nav-dark-text-color',
    '@hor-nav-text-color',
    '@nav-header-selected-text-color'
  ],
  indexFileName: 'index.html',
  generateOnce: false // generate color.less on each compilation
};


const overrideProcessEnv = value => config => {
  config.resolve.modules = [
    path.join(__dirname, 'src')
  ].concat(config.resolve.modules);
  return config;
};

const fixPostcssLoader = () => config => {
  if (config && config.module && Array.isArray(config.module.rules)) {
    config.module.rules.forEach(rule => {
      if (rule && Array.isArray(rule.oneOf)) {
        rule.oneOf.forEach(one => {
          const uses = one.use || (one.loader ? [one] : []);
          if (Array.isArray(uses)) {
            uses.forEach(u => {
              if (u && u.loader && u.loader.indexOf('postcss-loader') !== -1 && u.options) {
                // If options.plugins exists (old format), move it under postcssOptions.plugins
                if (u.options.plugins && !u.options.postcssOptions) {
                  u.options.postcssOptions = { plugins: u.options.plugins };
                  delete u.options.plugins;
                }
              }
            });
          }
        });
      }
    });
  }
  return config;
};

module.exports = override(
  addLessLoader({
    javascriptEnabled: true,
    lessOptions: {
      javascriptEnabled: true,
    }
  }),
  fixPostcssLoader(),
  overrideProcessEnv({
    VERSION: JSON.stringify(require('./package.json').version),
  })
);
