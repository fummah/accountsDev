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
          if (one.use && Array.isArray(one.use)) {
            one.use.forEach(loader => {
              if (loader && typeof loader === 'object' && loader.loader && loader.loader.includes('postcss-loader')) {
                // Remove ident property if it exists
                if (loader.options && loader.options.ident) {
                  delete loader.options.ident;
                }
                
                // Ensure proper structure for postcss options
                if (loader.options && !loader.options.postcssOptions) {
                  loader.options = {
                    postcssOptions: {
                      plugins: [
                        'postcss-flexbugs-fixes',
                        ['postcss-preset-env', {
                          autoprefixer: {
                            flexbox: 'no-2009',
                          },
                          stage: 3,
                        }],
                        'postcss-normalize',
                      ]
                    }
                  };
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
