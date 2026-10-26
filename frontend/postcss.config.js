/**
 * Purpose: PostCSS configuration for processing styles with Tailwind CSS and Autoprefixer.
 * Role in the project: Builds the CSS asset pipeline, compiling Tailwind utility classes into browser-ready CSS.
 * Key contents: tailwindcss plugin, autoprefixer plugin.
 * Talks to: tailwind.config.js, frontend/app/globals.css.
 */

module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
