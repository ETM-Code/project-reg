// tailwind.config.js - Updated with custom theme
module.exports = {
  content: [
    "./src/renderer/**/*.{html,js}", // Scan HTML and JS files
    "./src/renderer/components/**/*.js", // Scan potential future component JS files
    "./src/renderer/css/main.css", // Scan our main CSS for Tailwind directives/classes
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4f46e5',    // Indigo 600
        secondary: '#e5e7eb',  // Cool Gray 200
        accent: '#14b8a6',     // Teal 500
        'accent-hover': '#0d9488', // Teal 600
        background: '#f9fafb', // Gray 50
        foreground: '#374151', // Gray 700
        'content-bg': '#ffffff', // White
      },
    },
  },
  plugins: [],
};