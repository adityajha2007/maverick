/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{tsx,ts,jsx,js}", "./src/**/*.{tsx,ts,jsx,js}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        clinical: {
          primary: "#0043C8",
          "primary-dim": "#003AB2",
          "primary-container": "#0057FF",
          secondary: "#006688",
          "secondary-container": "#00C1FD",
          tertiary: "#38536C",
          surface: "#F7F9FB",
          "surface-dim": "#D8DADC",
          "surface-low": "#F2F4F6",
          "surface-mid": "#ECEEF0",
          "surface-high": "#E6E8EA",
          card: "#FFFFFF",
          fg: "#191C1E",
          muted: "#737688",
          "muted-variant": "#434656",
          outline: "#737688",
          "outline-var": "#C3C5D9",
          error: "#BA1A1A",
          "error-bg": "#FFDAD6",
          processing: "#6B5CE7",
        },
      },
    },
  },
  plugins: [],
};
