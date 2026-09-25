const path = require('path');
const {override, fixBabelImports, addLessLoader, removeModuleScopePlugin} = require('customize-cra')


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

const baseConfig = override(
  // Allow importing the single shared canonical Item Type table
  // (src/shared/itemTypes.json) that lives outside CRA's src/ scope. It is a
  // plain JSON module, so only the ModuleScope guard needs relaxing.
  removeModuleScopePlugin(),
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

/**
 * TerserPlugin defaults to `parallel: true`, which spawns (cpus - 1) jest-worker
 * PROCESSES, each with its own V8 heap. On a memory-constrained machine that
 * extra copy is what turns the production build into
 *
 *     # Fatal process out of memory: Zone
 *     FATAL ERROR: Zone Allocation failed - process out of memory      (exit 134)
 *
 * which is NOT the JS heap and cannot be fixed with --max-old-space-size.
 *
 * Set ACCULEDGER_BUILD_SERIAL=1 to minify in-process instead. The emitted
 * bundle is byte-identical either way — `parallel` only decides WHERE the
 * minification runs, not what it produces — so this is safe to use whenever
 * the machine is short on RAM. Default behaviour is unchanged.
 */
const serialMinifyWhenAsked = (config) => {
  if (process.env.ACCULEDGER_BUILD_SERIAL !== '1') return config;
  const minimizers = config && config.optimization && config.optimization.minimizer;
  if (Array.isArray(minimizers)) {
    for (const m of minimizers) {
      if (m && m.options && typeof m.options === 'object') {
        m.options.parallel = false;
      }
    }
  }
  return config;
};

module.exports = (config, env) => serialMinifyWhenAsked(baseConfig(config, env));
