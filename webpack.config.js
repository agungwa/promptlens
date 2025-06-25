const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

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
        { from: 'manifest.json', to: 'manifest.json' },
      ],
    }),
  ],
};