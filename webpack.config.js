const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const { WebpackManifestPlugin } = require('webpack-manifest-plugin');
const fs = require('fs');

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

// This is the base manifest that will be customized by the plugin
const manifestTemplate = {
  manifest_version: 3,
  name: packageJson.name,
  version: packageJson.version,
  description: packageJson.description,
  permissions: [
    "sidePanel",
    "storage",
    "contextMenus",
    "scripting",
    "tabs",
    "activeTab"
  ],
  host_permissions: [
    "<all_urls>"
  ],
  side_panel: {
    "default_path": "sidebar.html"
  },
  action: {
    "default_title": "Open Sidebar",
    "default_icon": {
      "16": "images/scraper.png",
      "48": "images/scraper.png",
      "128": "images/scraper.png"
    }
  },
  icons: {
    "16": "images/scraper.png",
    "48": "images/scraper.png",
    "128": "images/scraper.png"
  },
  web_accessible_resources: [
    {
      "resources": [ "app.html" ],
      "matches": [ "<all_urls>" ]
    }
  ]
};

module.exports = {
  entry: {
    background: './src/background.ts',
    sidebar: './src/sidebar.ts',
    content: './src/content.ts',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  mode: 'production',
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'sidebar.html', to: 'sidebar.html' },
        { from: 'app.html', to: 'app.html' },
        { from: 'style.css', to: 'style.css' },
        { from: 'tab-manager.css', to: 'tab-manager.css' },
        { from: 'images', to: 'images' },
      ],
    }),
    new WebpackManifestPlugin({
      fileName: 'manifest.json',
      generate: (seed, files, entrypoints) => {
        const manifest = { ...manifestTemplate };
        manifest.background = { "service_worker": entrypoints.background[0] };
        return manifest;
      }
    })
  ],
};